/**
 * store 的同步行為測試。
 *
 * 這裡不驗 Firestore 本身，驗的是「雲端出事的時候，我們的資料還在不在」：
 * 寫失敗有沒有留在佇列、讀到髒資料會不會退回本機、恢復連線後補送有沒有
 * 先合併雲端現況。這些都是實測踩過的坑（見 store.ts 與 week.ts 的註解），
 * 光靠瀏覽器手動測太慢也太容易漏，所以固定成自動測試。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeekPlan } from '../domain/types'
import { createWeekPlan, toggleCheck } from '../domain/week'
import { defaultSchedule } from '../domain/catalog'
import { checkKey } from '../domain/types'

/** 假的 Firestore：用一個 Map 當雲端，可以指定下一次讀／寫要爆掉 */
const cloud = new Map<string, unknown>()
let failNextSet = 0
let failNextGet = 0
let setCalls: Array<{ path: string; data: unknown }> = []
let releaseGet: (() => void) | null = null
let getGate: Promise<void> | null = null
const snapshotListeners = new Map<
  string,
  Set<(snap: { exists: () => boolean; data: () => unknown }) => void>
>()

function snapshot(path: string) {
  const data = cloud.get(path)
  return {
    exists: () => data !== undefined,
    data: () => data,
  }
}

function emitSnapshot(path: string): void {
  for (const listener of snapshotListeners.get(path) ?? []) listener(snapshot(path))
}

vi.mock('./firebase', () => ({
  firebaseEnabled: true,
  // Firestore 改成動態載入，所以這裡也是 async 的：store 拿到的是 promise
  getDb: () => Promise.resolve({ __fake: true }),
  USERS: ['bob', 'user1', 'user2'],
}))

vi.mock('firebase/firestore', () => ({
  // doc(db, 'users', uid, 'weeks', key) → 直接把路徑接成字串當 key
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: async (ref: { path: string }) => {
    if (getGate) await getGate
    if (failNextGet > 0) {
      failNextGet -= 1
      throw new Error('offline')
    }
    return snapshot(ref.path)
  },
  setDoc: async (ref: { path: string }, data: unknown) => {
    if (failNextSet > 0) {
      failNextSet -= 1
      throw new Error('offline')
    }
    setCalls.push({ path: ref.path, data })
    cloud.set(ref.path, JSON.parse(JSON.stringify(data)))
    emitSnapshot(ref.path)
  },
  onSnapshot: (
    ref: { path: string },
    next: (snap: { exists: () => boolean; data: () => unknown }) => void,
  ) => {
    const listeners = snapshotListeners.get(ref.path) ?? new Set()
    listeners.add(next)
    snapshotListeners.set(ref.path, listeners)
    next(snapshot(ref.path))
    return () => listeners.delete(next)
  },
}))

const { flushPending, isCloudOk, loadWeek, pendingCount, saveWeek, subscribeWeek } =
  await import('./store')
const { clearQueue } = await import('./syncQueue')

const WEEK = '2026-W31'
const PATH = `users/bob/weeks/${WEEK}`
const base = () => createWeekPlan(WEEK, defaultSchedule())

beforeEach(() => {
  cloud.clear()
  localStorage.clear()
  clearQueue()
  failNextSet = 0
  failNextGet = 0
  setCalls = []
  releaseGet = null
  getGate = null
  snapshotListeners.clear()
})

describe('saveWeek — 雲端寫入失敗', () => {
  it('寫失敗時本機仍然存得到（本機才是 source of truth）', async () => {
    failNextSet = 1
    const plan = toggleCheck(base(), 0, 'morning', 'arms')
    await saveWeek('bob', plan)

    const local = JSON.parse(localStorage.getItem(`workout:bob:week:${WEEK}`) as string) as WeekPlan
    expect(local.checked).toContain(checkKey(0, 'morning', 'arms'))
  })

  it('寫失敗 → 那筆留在待同步佇列', async () => {
    failNextSet = 1
    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))
    expect(pendingCount()).toBe(1)
  })

  it('寫成功 → 佇列清空，不留殘骸', async () => {
    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))
    expect(pendingCount()).toBe(0)
  })

  it('寫失敗 → 頁尾不准謊稱已同步', async () => {
    failNextSet = 1
    await saveWeek('bob', base())
    expect(isCloudOk()).toBe(false)
  })

  it('同一週連續失敗兩次 → 佇列只留最新那筆，不會越積越多', async () => {
    failNextSet = 2
    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))
    await saveWeek('bob', toggleCheck(base(), 1, 'morning', 'hiit'))
    expect(pendingCount()).toBe(1)
  })
})

describe('flushPending — 恢復連線後補送', () => {
  it('回線後把欠的送上去，佇列歸零', async () => {
    failNextSet = 1
    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))
    expect(pendingCount()).toBe(1)

    await flushPending()

    expect(pendingCount()).toBe(0)
    expect((cloud.get(PATH) as WeekPlan).checked).toContain(checkKey(0, 'morning', 'arms'))
  })

  it('還是連不上 → 佇列留著，等下一次，而且不謊稱同步成功', async () => {
    failNextSet = 3
    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))
    await flushPending()

    expect(pendingCount()).toBe(1)
    expect(isCloudOk()).toBe(false)
  })

  it('佇列空的時候 flush 不打雲端（省一次沒必要的往返）', async () => {
    setCalls = []
    await flushPending()
    expect(setCalls).toHaveLength(0)
  })

  it('補送前先合併雲端現況——不能把另一台的勾洗掉', async () => {
    // 這台離線時打了「週一早上」，寫不出去，留在佇列
    failNextSet = 1
    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))

    // 這段期間另一台裝置打了「週二早上」並成功上雲
    const other = { ...toggleCheck(base(), 1, 'morning', 'hiit'), updatedAt: Date.now() + 1000 }
    cloud.set(PATH, JSON.parse(JSON.stringify(other)))

    await flushPending()

    const final = cloud.get(PATH) as WeekPlan
    expect(final.checked).toContain(checkKey(0, 'morning', 'arms'))
    expect(final.checked).toContain(checkKey(1, 'morning', 'hiit'))
  })
})

describe('saveWeek — 即時寫入也要合併', () => {
  it('雲端已有另一台的勾 → 直接存不會蓋掉它', async () => {
    const other = { ...toggleCheck(base(), 1, 'morning', 'hiit'), updatedAt: Date.now() - 1000 }
    cloud.set(PATH, JSON.parse(JSON.stringify(other)))

    await saveWeek('bob', toggleCheck(base(), 0, 'morning', 'arms'))

    const final = cloud.get(PATH) as WeekPlan
    expect(final.checked).toContain(checkKey(0, 'morning', 'arms'))
    expect(final.checked).toContain(checkKey(1, 'morning', 'hiit'))
  })
})

describe('loadWeek — 雲端讀取', () => {
  it('雲端讀取途中打勾，回應抵達後不會用舊本機資料蓋掉', async () => {
    localStorage.setItem(`workout:bob:week:${WEEK}`, JSON.stringify(base()))
    cloud.set(PATH, JSON.parse(JSON.stringify(base())))
    getGate = new Promise<void>((resolve) => {
      releaseGet = resolve
    })

    const loading = loadWeek('bob', WEEK, defaultSchedule())
    await Promise.resolve()

    const checkedWhileLoading = toggleCheck(base(), 0, 'morning', 'arms')
    localStorage.setItem(
      `workout:bob:week:${WEEK}`,
      JSON.stringify(checkedWhileLoading),
    )
    releaseGet?.()

    const loaded = await loading
    expect(loaded.checked).toContain(checkKey(0, 'morning', 'arms'))
  })

  it('雲端讀失敗 → 退回本機資料，不是空白畫面', async () => {
    const plan = toggleCheck(base(), 0, 'morning', 'arms')
    localStorage.setItem(`workout:bob:week:${WEEK}`, JSON.stringify(plan))

    failNextGet = 1
    const loaded = await loadWeek('bob', WEEK, defaultSchedule())

    expect(loaded.checked).toContain(checkKey(0, 'morning', 'arms'))
    expect(isCloudOk()).toBe(false)
  })

  it('雲端資料形狀不對 → 當它不存在，用本機的', async () => {
    const plan = toggleCheck(base(), 0, 'morning', 'arms')
    localStorage.setItem(`workout:bob:week:${WEEK}`, JSON.stringify(plan))
    cloud.set(PATH, { weekKey: WEEK, checked: 'not-an-array' })

    const loaded = await loadWeek('bob', WEEK, defaultSchedule())
    expect(loaded.checked).toContain(checkKey(0, 'morning', 'arms'))
  })

  it('本機沒有、雲端也沒有 → 用模板生一份新的', async () => {
    const loaded = await loadWeek('bob', WEEK, defaultSchedule())
    expect(loaded.weekKey).toBe(WEEK)
    expect(loaded.checked).toEqual([])
  })

  it('本機與雲端各有一個勾 → 合併，兩個都留著', async () => {
    const local = { ...toggleCheck(base(), 0, 'morning', 'arms'), updatedAt: 1000 }
    localStorage.setItem(`workout:bob:week:${WEEK}`, JSON.stringify(local))
    const remote = { ...toggleCheck(base(), 1, 'morning', 'hiit'), updatedAt: 2000 }
    cloud.set(PATH, JSON.parse(JSON.stringify(remote)))

    const loaded = await loadWeek('bob', WEEK, defaultSchedule())
    expect(loaded.checked).toContain(checkKey(0, 'morning', 'arms'))
    expect(loaded.checked).toContain(checkKey(1, 'morning', 'hiit'))
  })

  it('本機有雲端沒有的勾 → 合併結果要推回雲端補上', async () => {
    const local = { ...toggleCheck(base(), 0, 'morning', 'arms'), updatedAt: 1000 }
    localStorage.setItem(`workout:bob:week:${WEEK}`, JSON.stringify(local))
    cloud.set(PATH, JSON.parse(JSON.stringify({ ...base(), updatedAt: 2000 })))

    await loadWeek('bob', WEEK, defaultSchedule())
    // saveWeek 是 fire-and-forget，等一輪 microtask 讓它落地
    await new Promise((r) => setTimeout(r, 0))

    expect((cloud.get(PATH) as WeekPlan).checked).toContain(checkKey(0, 'morning', 'arms'))
  })

  it('本機是壞掉的 JSON → 當作沒有，不要整個爆掉', async () => {
    localStorage.setItem(`workout:bob:week:${WEEK}`, '{ 壞掉的')
    const loaded = await loadWeek('bob', WEEK, defaultSchedule())
    expect(loaded.weekKey).toBe(WEEK)
  })
})

describe('subscribeWeek — realtime 跨裝置同步', () => {
  it('遠端文件變更會立即送給訂閱者，取消後不再送', async () => {
    const received: WeekPlan[] = []
    const stop = await subscribeWeek('bob', WEEK, (plan) => received.push(plan))

    cloud.set(PATH, JSON.parse(JSON.stringify(toggleCheck(base(), 1, 'morning', 'hiit'))))
    emitSnapshot(PATH)
    expect(received.at(-1)?.checked).toContain(checkKey(1, 'morning', 'hiit'))

    const countBeforeStop = received.length
    stop()
    cloud.set(PATH, JSON.parse(JSON.stringify(toggleCheck(base(), 0, 'morning', 'arms'))))
    emitSnapshot(PATH)
    expect(received).toHaveLength(countBeforeStop)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearQueue,
  dequeue,
  enqueue,
  flushQueue,
  peekQueue,
  queueSize,
  type PendingWrite,
} from './syncQueue'

const WEEK: PendingWrite = {
  kind: 'week',
  uid: 'bob',
  weekKey: '2026-W31',
  payload: { weekKey: '2026-W31', updatedAt: 100 },
}

const TEMPLATE: PendingWrite = {
  kind: 'template',
  uid: 'bob',
  payload: { updatedAt: 100 },
}

beforeEach(() => {
  localStorage.clear()
  clearQueue()
})

describe('佇列本身', () => {
  it('排進去的寫入會留著', () => {
    enqueue(WEEK)
    expect(queueSize()).toBe(1)
    expect(peekQueue()[0]).toMatchObject({ kind: 'week', weekKey: '2026-W31' })
  })

  it('同一格重複排隊只留最新那筆——舊的送上去也會被蓋掉', () => {
    enqueue(WEEK)
    enqueue({ ...WEEK, payload: { weekKey: '2026-W31', updatedAt: 200 } })
    expect(queueSize()).toBe(1)
    expect(peekQueue()[0].payload).toMatchObject({ updatedAt: 200 })
  })

  it('不同週各自排隊，不會互相蓋掉', () => {
    enqueue(WEEK)
    enqueue({ ...WEEK, weekKey: '2026-W32' })
    expect(queueSize()).toBe(2)
  })

  it('週計畫與模板是不同格，不會互相蓋掉', () => {
    enqueue(WEEK)
    enqueue(TEMPLATE)
    expect(queueSize()).toBe(2)
  })

  it('不同使用者不會互相蓋掉', () => {
    enqueue(WEEK)
    enqueue({ ...WEEK, uid: 'user1' })
    expect(queueSize()).toBe(2)
  })
})

describe('dequeue：送達確認後才移除', () => {
  it('送達的那筆會被移出佇列', () => {
    enqueue(WEEK)
    dequeue(WEEK)
    expect(queueSize()).toBe(0)
  })

  it('送出期間又改了一次 → 較新的那筆不能被舊的成功回報清掉', () => {
    enqueue(WEEK)
    const newer = { ...WEEK, payload: { weekKey: '2026-W31', updatedAt: 999 } }
    enqueue(newer) // 使用者又改了，蓋在同一格
    dequeue(WEEK) // 舊的那次 setDoc 現在才回報成功
    expect(queueSize()).toBe(1)
    expect(peekQueue()[0].payload).toMatchObject({ updatedAt: 999 })
  })

  it('移除不存在的項目不會炸', () => {
    expect(() => dequeue(WEEK)).not.toThrow()
    expect(queueSize()).toBe(0)
  })
})

describe('關頁面也不能掉', () => {
  it('佇列存在 localStorage，不是只在記憶體裡', () => {
    enqueue(WEEK)
    // 直接看 localStorage：關掉分頁後記憶體就沒了，能不能撐過重開全看這裡
    const raw = localStorage.getItem('workout:syncQueue')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string)).toHaveLength(1)
  })

  it('讀佇列只認 localStorage 的內容——模擬重開頁面', () => {
    // 沒經過 enqueue，直接塞資料進 localStorage = 上一個 session 留下的
    localStorage.setItem(
      'workout:syncQueue',
      JSON.stringify([{ kind: 'week', uid: 'bob', weekKey: '2026-W30', payload: {} }]),
    )
    expect(queueSize()).toBe(1)
    expect(peekQueue()[0].weekKey).toBe('2026-W30')
  })

  it('localStorage 壞掉不會炸，只是回空佇列', () => {
    localStorage.setItem('workout:syncQueue', '{{{ 不是 JSON')
    expect(() => queueSize()).not.toThrow()
    expect(queueSize()).toBe(0)
  })
})

describe('flush：網路回來時把欠的送上去', () => {
  it('全部成功就清空佇列', async () => {
    enqueue(WEEK)
    enqueue(TEMPLATE)
    const send = vi.fn().mockResolvedValue(undefined)

    const result = await flushQueue(send)

    expect(send).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ sent: 2, failed: 0 })
    expect(queueSize()).toBe(0)
  })

  it('送失敗的要留在佇列裡，下次再試——這是「保證同步」的關鍵', async () => {
    enqueue(WEEK)
    const send = vi.fn().mockRejectedValue(new Error('offline'))

    const result = await flushQueue(send)

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(queueSize()).toBe(1)
  })

  it('部分失敗：成功的清掉，失敗的留著', async () => {
    enqueue(WEEK)
    enqueue({ ...WEEK, weekKey: '2026-W32' })
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))

    const result = await flushQueue(send)

    expect(result).toEqual({ sent: 1, failed: 1 })
    expect(queueSize()).toBe(1)
    expect(peekQueue()[0].weekKey).toBe('2026-W32')
  })

  it('flush 期間新排進來的寫入不會被清掉', async () => {
    enqueue(WEEK)
    const send = vi.fn().mockImplementation(async () => {
      enqueue({ ...WEEK, weekKey: '2026-W33' })
    })

    await flushQueue(send)

    expect(queueSize()).toBe(1)
    expect(peekQueue()[0].weekKey).toBe('2026-W33')
  })

  it('空佇列 flush 不會呼叫 send', async () => {
    const send = vi.fn()
    const result = await flushQueue(send)
    expect(send).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: 0, failed: 0 })
  })

  it('併發 flush 不會把同一筆送兩次', async () => {
    enqueue(WEEK)
    let resolveSend: (() => void) | undefined
    const send = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve
        }),
    )

    const first = flushQueue(send)
    const second = flushQueue(send)
    resolveSend?.()
    await Promise.all([first, second])

    expect(send).toHaveBeenCalledTimes(1)
  })
})

import { firebaseEnabled, getDb } from './firebase'
export type { UserId } from './firebase'
import type { Schedule, Template, WeekPlan } from '../domain/types'
import { isTemplate, isWeekPlan } from './schema'
import { defaultSchedule } from '../domain/catalog'
import { createWeekPlan, mergeWeekPlans, normalizeWeekPlan } from '../domain/week'
import { dequeue, enqueue, flushQueue, queueSize, type PendingWrite } from './syncQueue'

const LOCAL_PREFIX = 'workout'

/**
 * 取得 Firestore 實例與需要的那三個函式，全部動態載入。
 *
 * 為什麼不在檔案頂層 import：`firebase/firestore` 佔 gzip 138 KB，
 * 頂層 import 會把它綁進主 chunk、擋在第一屏前面。這個 app 沒有雲端
 * 也完全能用（localStorage 才是 source of truth），所以雲端這條路
 * 一律等真的要讀寫時才載。
 *
 * 回傳 null = 雲端不可用（沒設定 env，或載入失敗），呼叫端一律當離線處理。
 */
async function cloud() {
  if (!firebaseEnabled) return null
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
  if (!db) return null
  return {
    db,
    doc: fs.doc,
    getDoc: fs.getDoc,
    setDoc: fs.setDoc,
    onSnapshot: fs.onSnapshot,
  }
}

function localWeekKey(uid: string, weekKey: string): string {
  return `${LOCAL_PREFIX}:${uid}:week:${weekKey}`
}

function localTemplateKey(uid: string): string {
  return `${LOCAL_PREFIX}:${uid}:template`
}

/**
 * 讀本機資料。同樣要驗形狀：舊版本存的舊格式、寫到一半被中斷的半截 JSON
 * 都會讓 domain/ 的純函式收到不該有的東西。驗不過就當沒有，讓上層重建。
 */
function readLocal<T>(key: string, guard: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error: unknown) {
    console.warn('本機儲存失敗', error)
  }
}

/**
 * 雲端到底通不通，只認「真的成功讀或寫過一次 Firestore」。
 * 不准拿「設定有填」當通了 —— 那是 handshake，會讓畫面對使用者說謊。
 */
let cloudOk = false
const cloudListeners = new Set<(ok: boolean) => void>()

function setCloudOk(ok: boolean): void {
  if (cloudOk === ok) return
  cloudOk = ok
  for (const listener of cloudListeners) listener(ok)
}

export function isCloudOk(): boolean {
  return cloudOk
}

/** 訂閱雲端連線狀態，回傳 unsubscribe */
export function watchCloud(listener: (ok: boolean) => void): () => void {
  cloudListeners.add(listener)
  listener(cloudOk)
  return () => cloudListeners.delete(listener)
}

/** ---------- 只讀本機（同步、不碰雲端） ---------- */

/**
 * 這兩個給「先畫再說」用：開頁時同步讀本機，畫面立刻出得來，
 * 不必等 Firestore 那 138 KB 載完。雲端版本晚點回來再覆蓋。
 *
 * localStorage 本來就是 source of truth，所以先畫的這一份不是暫時的假資料，
 * 而是正確的資料——雲端只是可能更新一點。
 */
export function loadWeekLocal(uid: string, weekKey: string): WeekPlan | null {
  const plan = readLocal(localWeekKey(uid, weekKey), isWeekPlan)
  return plan ? normalizeWeekPlan(plan) : null
}

export function loadTemplateLocal(uid: string): Schedule | null {
  return readLocal(localTemplateKey(uid), isTemplate)?.schedule ?? null
}

/** ---------- 模板 ---------- */

export async function loadTemplate(uid: string): Promise<Template> {
  const local = readLocal(localTemplateKey(uid), isTemplate)

  const c = await cloud()
  if (c) {
    try {
      const snap = await c.getDoc(c.doc(c.db, 'users', uid, 'meta', 'template'))
      setCloudOk(true)
      if (snap.exists()) {
        const remote: unknown = snap.data()
        // 形狀不對就當它不存在，退回本機——髒資料流進 domain/ 會讓畫面莫名爆掉
        if (!isTemplate(remote)) {
          console.warn('雲端模板格式不正確，改用本機資料')
        } else if (!local || remote.updatedAt >= local.updatedAt) {
          // 取較新的那份
          writeLocal(localTemplateKey(uid), remote)
          return remote
        }
      }
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('讀取雲端模板失敗，使用本機資料', error)
    }
  }

  if (local) return local
  return { schedule: defaultSchedule(), updatedAt: Date.now() }
}

export async function saveTemplate(uid: string, schedule: Schedule): Promise<void> {
  const template: Template = { schedule, updatedAt: Date.now() }
  writeLocal(localTemplateKey(uid), template)

  if (firebaseEnabled) {
    // 先記帳再送（write-ahead）。理由見 saveWeek 的註解。
    enqueue({ kind: 'template', uid, payload: template })
    try {
      const c = await cloud()
      if (!c) throw new Error('Firestore 不可用')
      await c.setDoc(c.doc(c.db, 'users', uid, 'meta', 'template'), template)
      dequeue({ kind: 'template', uid, payload: template })
      setCloudOk(true)
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('同步模板到雲端失敗，留在待同步佇列', error)
    }
  }
}

/** ---------- 週計畫 ---------- */

export async function loadWeek(
  uid: string,
  weekKey: string,
  fallbackSchedule: Schedule,
): Promise<WeekPlan> {
  const key = localWeekKey(uid, weekKey)
  const rawInitialLocal = readLocal(key, isWeekPlan)
  const initialLocal = rawInitialLocal ? normalizeWeekPlan(rawInitialLocal) : null

  const c = await cloud()
  if (c) {
    try {
      const snap = await c.getDoc(c.doc(c.db, 'users', uid, 'weeks', weekKey))
      setCloudOk(true)
      if (snap.exists()) {
        const remote: unknown = snap.data()
        if (!isWeekPlan(remote)) {
          console.warn('雲端週計畫格式不正確，改用本機資料')
        } else {
          /*
           * Firestore 往返期間使用者仍可打勾。不能拿函式剛開始時讀到的
           * initialLocal 合併，否則較晚的本機打勾會被這次舊讀取覆蓋。
           * 回應抵達時重讀一次 localStorage，才是真正的最新本機狀態。
           */
          const rawLatestLocal = readLocal(key, isWeekPlan)
          const latestLocal = rawLatestLocal ? normalizeWeekPlan(rawLatestLocal) : initialLocal
          /**
           * 合併，不是二選一。兩台裝置各自離線打不同的勾時，單純取較新的那份
           * 會把另一台的勾整份蓋掉（實測過，勾就這樣消失）。見 mergeWeekPlans。
           */
          const merged = latestLocal ? mergeWeekPlans(latestLocal, remote) : remote
          writeLocal(key, merged)
          // 合併後跟雲端不一樣 = 本機有雲端沒有的勾，推回去補上
          if (latestLocal && merged.checked.length !== remote.checked.length) {
            void saveWeek(uid, merged)
          }
          return merged
        }
      }
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('讀取雲端週計畫失敗，使用本機資料', error)
    }
  }

  const rawLatestLocal = readLocal(key, isWeekPlan)
  const latestLocal = rawLatestLocal ? normalizeWeekPlan(rawLatestLocal) : initialLocal
  if (latestLocal) return latestLocal
  // 這週還沒開始 → 用模板生成一份新的
  return createWeekPlan(weekKey, fallbackSchedule)
}

/**
 * 訂閱同一帳號、同一週的 Firestore 文件。
 *
 * getDoc 只會在開頁時讀一次；跨分頁／跨手機要做到真正 realtime，必須靠
 * onSnapshot。這裡只負責驗證並送出遠端資料，如何跟目前畫面合併由 hook 決定。
 */
export async function subscribeWeek(
  uid: string,
  weekKey: string,
  onPlan: (plan: WeekPlan) => void,
): Promise<() => void> {
  const c = await cloud()
  if (!c) return () => undefined

  const ref = c.doc(c.db, 'users', uid, 'weeks', weekKey)
  return c.onSnapshot(
    ref,
    (snap) => {
      setCloudOk(true)
      if (!snap.exists()) return
      const remote: unknown = snap.data()
      if (!isWeekPlan(remote)) {
        console.warn('雲端週計畫格式不正確，略過 realtime 更新')
        return
      }
      onPlan(remote)
    },
    (error) => {
      setCloudOk(false)
      console.warn('監聽雲端週計畫失敗', error)
    },
  )
}

/**
 * 立刻寫本機（同步、便宜）。
 * 雲端同步才需要 debounce；本機寫入不能延遲，否則切週或關頁面會掉資料。
 */
export function saveWeekLocal(uid: string, plan: WeekPlan): void {
  writeLocal(localWeekKey(uid, plan.weekKey), plan)
}

/**
 * 把一份週計畫寫上雲端，寫之前先把雲端現況合併進來。
 *
 * 為什麼不能直接 `setDoc(plan)`：那是整份文件的 last-write-wins。兩台裝置
 * 各自離線打不同的勾時，後寫的那份會把先寫的整份蓋掉——實測過，A 打的勾
 * 就這樣消失（見 mergeWeekPlans 的註解）。所以每次上雲都要 read-merge-write。
 *
 * 這條路徑同時給「即時寫入」與「離線佇列補送」用，兩邊都得合併，
 * 否則補送的那筆一樣會把別台的勾洗掉。
 */
async function pushWeek(uid: string, plan: WeekPlan): Promise<WeekPlan> {
  const c = await cloud()
  if (!c) throw new Error('Firestore 未初始化')

  const ref = c.doc(c.db, 'users', uid, 'weeks', plan.weekKey)
  let payload = plan

  const snap = await c.getDoc(ref)
  if (snap.exists()) {
    const remote: unknown = snap.data()
    if (isWeekPlan(remote)) payload = mergeWeekPlans(remote, plan)
  }

  await c.setDoc(ref, payload)
  writeLocal(localWeekKey(uid, payload.weekKey), payload)
  return payload
}

export async function saveWeek(uid: string, plan: WeekPlan): Promise<void> {
  writeLocal(localWeekKey(uid, plan.weekKey), plan)

  if (firebaseEnabled) {
    /**
     * 先記帳再送（write-ahead），不是「失敗才記帳」。
     *
     * 離線時 `setDoc` **不會 reject** —— Firestore SDK 把它收進自己的記憶體緩衝，
     * promise 就一直懸著，所以 catch 區塊根本不會執行。實測（兩個瀏覽器 context）：
     * 離線打勾後直接關掉分頁，SDK 的緩衝隨記憶體消失，另一台裝置永遠讀不到，
     * 但本機 localStorage 有紀錄，使用者看到勾以為同步了。
     *
     * 所以要在送出「之前」就把這筆寫進持久化佇列，確認送達才移除。
     */
    const item: PendingWrite = { kind: 'week', uid, weekKey: plan.weekKey, payload: plan }
    enqueue(item)
    try {
      await pushWeek(uid, plan)
      dequeue(item)
      setCloudOk(true)
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('同步週計畫到雲端失敗，留在待同步佇列', error)
    }
  }
}

/** ---------- 待同步佇列 ---------- */

/**
 * 把一筆待同步的寫入真的送上 Firestore。
 *
 * 週計畫要先讀回雲端現況再合併：這筆是離線期間排隊的，排隊這段時間另一台
 * 裝置可能已經打了別的勾。直接蓋上去等於把對方的勾洗掉——正是 mergeWeekPlans
 * 要解決的那個問題，補送這條路徑同樣得走。
 */
async function sendPending(item: PendingWrite): Promise<void> {
  const c = await cloud()
  if (!c) throw new Error('Firestore 未初始化')

  if (item.kind === 'template') {
    await c.setDoc(
      c.doc(c.db, 'users', item.uid, 'meta', 'template'),
      item.payload as Record<string, unknown>,
    )
    return
  }

  await pushWeek(item.uid, item.payload as WeekPlan)
}

/**
 * 把離線期間欠的寫入補送上雲端。
 * 網路恢復、頁面重新可見、以及離開頁面前都會呼叫。
 */
export async function flushPending(): Promise<void> {
  if (!firebaseEnabled) return
  // 佇列空的就不要載 Firestore——沒事做卻拉 138 KB 下來很蠢
  if (queueSize() === 0) return

  const result = await flushQueue(sendPending)
  // 有送出去才算真的通了；全掛就維持離線狀態，別對使用者說謊
  if (result.sent > 0) setCloudOk(true)
  else if (result.failed > 0) setCloudOk(false)
}

export function pendingCount(): number {
  return queueSize()
}

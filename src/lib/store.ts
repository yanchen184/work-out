import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, firebaseEnabled } from './firebase'
export type { UserId } from './firebase'
import type { Schedule, Template, WeekPlan } from '../domain/types'
import { isTemplate, isWeekPlan } from './schema'
import { defaultSchedule } from '../domain/catalog'
import { createWeekPlan } from '../domain/week'
import { dequeue, enqueue, flushQueue, queueSize, type PendingWrite } from './syncQueue'

const LOCAL_PREFIX = 'workout'

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

/** ---------- 模板 ---------- */

export async function loadTemplate(uid: string): Promise<Template> {
  const local = readLocal(localTemplateKey(uid), isTemplate)

  if (firebaseEnabled && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'meta', 'template'))
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

  if (firebaseEnabled && db) {
    // 先記帳再送（write-ahead）。理由見 saveWeek 的註解。
    enqueue({ kind: 'template', uid, payload: template })
    try {
      await setDoc(doc(db, 'users', uid, 'meta', 'template'), template)
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
  const local = readLocal(localWeekKey(uid, weekKey), isWeekPlan)

  if (firebaseEnabled && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'weeks', weekKey))
      setCloudOk(true)
      if (snap.exists()) {
        const remote: unknown = snap.data()
        if (!isWeekPlan(remote)) {
          console.warn('雲端週計畫格式不正確，改用本機資料')
        } else if (!local || remote.updatedAt >= local.updatedAt) {
          writeLocal(localWeekKey(uid, weekKey), remote)
          return remote
        }
      }
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('讀取雲端週計畫失敗，使用本機資料', error)
    }
  }

  if (local) return local
  // 這週還沒開始 → 用模板生成一份新的
  return createWeekPlan(weekKey, fallbackSchedule)
}

/**
 * 立刻寫本機（同步、便宜）。
 * 雲端同步才需要 debounce；本機寫入不能延遲，否則切週或關頁面會掉資料。
 */
export function saveWeekLocal(uid: string, plan: WeekPlan): void {
  writeLocal(localWeekKey(uid, plan.weekKey), plan)
}

export async function saveWeek(uid: string, plan: WeekPlan): Promise<void> {
  writeLocal(localWeekKey(uid, plan.weekKey), plan)

  if (firebaseEnabled && db) {
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
      await setDoc(doc(db, 'users', uid, 'weeks', plan.weekKey), plan)
      dequeue(item)
      setCloudOk(true)
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('同步週計畫到雲端失敗，留在待同步佇列', error)
    }
  }
}

/** ---------- 待同步佇列 ---------- */

/** 把一筆待同步的寫入真的送上 Firestore */
async function sendPending(item: PendingWrite): Promise<void> {
  if (!db) throw new Error('Firestore 未初始化')

  const ref =
    item.kind === 'week'
      ? doc(db, 'users', item.uid, 'weeks', item.weekKey as string)
      : doc(db, 'users', item.uid, 'meta', 'template')

  await setDoc(ref, item.payload as Record<string, unknown>)
}

/**
 * 把離線期間欠的寫入補送上雲端。
 * 網路恢復、頁面重新可見、以及離開頁面前都會呼叫。
 */
export async function flushPending(): Promise<void> {
  if (!firebaseEnabled || !db) return
  if (queueSize() === 0) return

  const result = await flushQueue(sendPending)
  // 有送出去才算真的通了；全掛就維持離線狀態，別對使用者說謊
  if (result.sent > 0) setCloudOk(true)
  else if (result.failed > 0) setCloudOk(false)
}

export function pendingCount(): number {
  return queueSize()
}

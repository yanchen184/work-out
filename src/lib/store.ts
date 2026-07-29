import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, firebaseEnabled } from './firebase'
export type { UserId } from './firebase'
import type { Schedule, Template, WeekPlan } from '../domain/types'
import { defaultSchedule } from '../domain/catalog'
import { createWeekPlan } from '../domain/week'

const LOCAL_PREFIX = 'workout'

function localWeekKey(uid: string, weekKey: string): string {
  return `${LOCAL_PREFIX}:${uid}:week:${weekKey}`
}

function localTemplateKey(uid: string): string {
  return `${LOCAL_PREFIX}:${uid}:template`
}

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
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
  const local = readLocal<Template>(localTemplateKey(uid))

  if (firebaseEnabled && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'meta', 'template'))
      setCloudOk(true)
      if (snap.exists()) {
        const remote = snap.data() as Template
        // 取較新的那份
        if (!local || remote.updatedAt >= local.updatedAt) {
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
    try {
      await setDoc(doc(db, 'users', uid, 'meta', 'template'), template)
      setCloudOk(true)
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('同步模板到雲端失敗，已存在本機', error)
    }
  }
}

/** ---------- 週計畫 ---------- */

export async function loadWeek(
  uid: string,
  weekKey: string,
  fallbackSchedule: Schedule,
): Promise<WeekPlan> {
  const local = readLocal<WeekPlan>(localWeekKey(uid, weekKey))

  if (firebaseEnabled && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'weeks', weekKey))
      setCloudOk(true)
      if (snap.exists()) {
        const remote = snap.data() as WeekPlan
        if (!local || remote.updatedAt >= local.updatedAt) {
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
    try {
      await setDoc(doc(db, 'users', uid, 'weeks', plan.weekKey), plan)
      setCloudOk(true)
    } catch (error: unknown) {
      setCloudOk(false)
      console.warn('同步週計畫到雲端失敗，已存在本機', error)
    }
  }
}

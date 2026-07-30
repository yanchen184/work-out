/**
 * 雲端資料的型別守衛。
 *
 * 為什麼需要：`snap.data() as WeekPlan` 是空頭支票 —— 那個 `as` 不檢查任何東西。
 * Firestore 那三格沒有 Auth 保護（見專案 CLAUDE.md 的「帳號模型」），任何知道
 * 專案 ID 的人都能寫進去；就算沒有人亂寫，舊版本存的舊格式、寫到一半斷線的
 * 半截文件也會讓形狀對不上。這些髒資料一路流進 `domain/` 的純函式，
 * 症狀會是畫面莫名空白或 `undefined is not iterable`，而且很難追回源頭。
 *
 * 所以雲端讀回來的東西一律先驗形狀，驗不過就當它不存在、退回本機資料。
 * 手寫而不是引 zod：schema 很小又封閉，而且 bundle 大小是這個專案在意的事。
 */

import type { DayIndex, MakeupItem, Schedule, SlotKey, Template, WeekPlan } from '../domain/types'

const DAYS: readonly DayIndex[] = [0, 1, 2, 3, 4, 5, 6]
const SLOTS: readonly SlotKey[] = ['morning', 'evening']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** 7 天 × 2 時段，每格都要是字串陣列 */
export function isSchedule(value: unknown): value is Schedule {
  if (!isObject(value)) return false

  return DAYS.every((day) => {
    const entry = value[String(day)]
    if (!isObject(entry)) return false
    return SLOTS.every((slot) => isStringArray(entry[slot]))
  })
}

function isMakeupItem(value: unknown): value is MakeupItem {
  if (!isObject(value)) return false
  return (
    typeof value.groupId === 'string' &&
    typeof value.fromDay === 'number' &&
    DAYS.includes(value.fromDay as DayIndex) &&
    SLOTS.includes(value.fromSlot as SlotKey) &&
    typeof value.dismissed === 'boolean'
  )
}

export function isWeekPlan(value: unknown): value is WeekPlan {
  if (!isObject(value)) return false
  return (
    typeof value.weekKey === 'string' &&
    value.weekKey.length > 0 &&
    isSchedule(value.schedule) &&
    isStringArray(value.checked) &&
    Array.isArray(value.makeups) &&
    value.makeups.every(isMakeupItem) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  )
}

export function isTemplate(value: unknown): value is Template {
  if (!isObject(value)) return false
  return (
    isSchedule(value.schedule) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  )
}

import type {
  DayIndex,
  MakeupItem,
  Schedule,
  SlotKey,
  WeekPlan,
} from './types'
import { checkKey } from './types'
import { CATALOG, emptySchedule } from './catalog'

const DAY_MS = 86_400_000

/** 週一為一週之首。回傳該日期所屬週的週一 00:00。 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // JS: 0=週日 … 6=週六 → 轉成 0=週一 … 6=週日
  const shifted = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shifted)
  return d
}

/**
 * ISO-8601 週次 key，例：2026-W31。
 * ISO 規則：含該年第一個週四的那週為第 1 週。
 */
export function weekKeyOf(date: Date): string {
  const monday = startOfWeek(date)
  // 該週的週四決定歸屬年份
  const thursday = new Date(monday.getTime() + 3 * DAY_MS)
  const year = thursday.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const firstThursday = new Date(jan1.getTime() + ((4 - ((jan1.getDay() + 6) % 7) - 1 + 7) % 7) * DAY_MS)
  const firstMonday = startOfWeek(firstThursday)
  const week = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** 位移 n 週後的週次 key */
export function shiftWeekKey(date: Date, offsetWeeks: number): string {
  const monday = startOfWeek(date)
  return weekKeyOf(new Date(monday.getTime() + offsetWeeks * 7 * DAY_MS))
}

/** 該週次 key 對應的週一日期（用來顯示日期範圍） */
export function mondayOfWeekKey(key: string): Date {
  const [yearStr, weekStr] = key.split('-W')
  const year = Number(yearStr)
  const week = Number(weekStr)
  const jan1 = new Date(year, 0, 1)
  const firstThursday = new Date(jan1.getTime() + ((4 - ((jan1.getDay() + 6) % 7) - 1 + 7) % 7) * DAY_MS)
  const firstMonday = startOfWeek(firstThursday)
  return new Date(firstMonday.getTime() + (week - 1) * 7 * DAY_MS)
}

export function formatWeekRange(key: string): string {
  const monday = mondayOfWeekKey(key)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  const f = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${f(monday)} – ${f(sunday)}`
}

export function createWeekPlan(weekKey: string, schedule: Schedule): WeekPlan {
  return { weekKey, schedule, checked: [], makeups: [], updatedAt: Date.now() }
}

/** ---------- 不可變更新 ---------- */

function replaceSlot(
  schedule: Schedule,
  day: DayIndex,
  slot: SlotKey,
  next: readonly string[],
): Schedule {
  return {
    ...schedule,
    [day]: { ...schedule[day], [slot]: next },
  }
}

export function toggleCheck(
  plan: WeekPlan,
  day: DayIndex,
  slot: SlotKey,
  groupId: string,
): WeekPlan {
  const key = checkKey(day, slot, groupId)
  const has = plan.checked.includes(key)
  return {
    ...plan,
    checked: has ? plan.checked.filter((k) => k !== key) : [...plan.checked, key],
    updatedAt: Date.now(),
  }
}

/**
 * 一次把某時段整段設為完成／未完成。
 * 必須是單一次更新——逐項呼叫 toggleCheck 在 React 裡會踩到 stale closure，
 * 三個項目只會有最後一個生效。
 */
export function setSlotChecked(
  plan: WeekPlan,
  day: DayIndex,
  slot: SlotKey,
  done: boolean,
): WeekPlan {
  const items = plan.schedule[day][slot]
  if (items.length === 0) return plan

  const keys = items.map((g) => checkKey(day, slot, g))
  const already = keys.every((k) => plan.checked.includes(k))
  const none = keys.every((k) => !plan.checked.includes(k))
  // 已經是目標狀態 → 原樣返回，不製造新物件
  if (done ? already : none) return plan

  const rest = plan.checked.filter((k) => !keys.includes(k))
  return {
    ...plan,
    checked: done ? [...rest, ...keys] : rest,
    updatedAt: Date.now(),
  }
}

/**
 * 單日替換：把某格的某項目換成另一個項目。
 * 被換掉的項目進補做池（除非它本來就已經打過勾）。
 */
export function swapGroup(
  plan: WeekPlan,
  day: DayIndex,
  slot: SlotKey,
  fromGroupId: string,
  toGroupId: string,
): WeekPlan {
  const current = plan.schedule[day][slot]
  if (!current.includes(fromGroupId)) return plan
  if (current.includes(toGroupId)) return plan

  const next = current.map((g) => (g === fromGroupId ? toGroupId : g))
  const wasChecked = plan.checked.includes(checkKey(day, slot, fromGroupId))

  const makeups: MakeupItem[] = wasChecked
    ? [...plan.makeups]
    : [
        ...plan.makeups.filter(
          (m) => !(m.groupId === fromGroupId && m.fromDay === day && m.fromSlot === slot),
        ),
        { groupId: fromGroupId, fromDay: day, fromSlot: slot, dismissed: false },
      ]

  return {
    ...plan,
    schedule: replaceSlot(plan.schedule, day, slot, next),
    // 舊項目的勾要清掉，新項目從未打勾開始
    checked: plan.checked.filter((k) => k !== checkKey(day, slot, fromGroupId)),
    makeups,
    updatedAt: Date.now(),
  }
}

/** 在某格新增一個項目 */
export function addToSlot(
  plan: WeekPlan,
  day: DayIndex,
  slot: SlotKey,
  groupId: string,
): WeekPlan {
  const current = plan.schedule[day][slot]
  if (current.includes(groupId)) return plan
  return {
    ...plan,
    schedule: replaceSlot(plan.schedule, day, slot, [...current, groupId]),
    // 若補做池有這項，視為已補回
    makeups: plan.makeups.filter((m) => m.groupId !== groupId),
    updatedAt: Date.now(),
  }
}

/** 從某格移除一個項目（進補做池） */
export function removeFromSlot(
  plan: WeekPlan,
  day: DayIndex,
  slot: SlotKey,
  groupId: string,
): WeekPlan {
  const current = plan.schedule[day][slot]
  if (!current.includes(groupId)) return plan
  const wasChecked = plan.checked.includes(checkKey(day, slot, groupId))
  return {
    ...plan,
    schedule: replaceSlot(
      plan.schedule,
      day,
      slot,
      current.filter((g) => g !== groupId),
    ),
    checked: plan.checked.filter((k) => k !== checkKey(day, slot, groupId)),
    makeups: wasChecked
      ? plan.makeups
      : [
          ...plan.makeups.filter(
            (m) => !(m.groupId === groupId && m.fromDay === day && m.fromSlot === slot),
          ),
          { groupId, fromDay: day, fromSlot: slot, dismissed: false },
        ],
    updatedAt: Date.now(),
  }
}

/** 標記某補做項目本週跳過 */
export function dismissMakeup(plan: WeekPlan, groupId: string): WeekPlan {
  return {
    ...plan,
    makeups: plan.makeups.map((m) =>
      m.groupId === groupId ? { ...m, dismissed: true } : m,
    ),
    updatedAt: Date.now(),
  }
}

/** ---------- 進度計算 ---------- */

export interface GroupProgress {
  readonly groupId: string
  readonly name: string
  readonly done: number
  readonly planned: number
  readonly target: number
  readonly tone: string
  readonly targetAmount: number
  readonly unit: string
}

/**
 * 每個部位的本週進度。
 * done    = 已打勾的時段數
 * planned = 本週課表排了幾個時段
 * target  = 清單設定的目標時段數
 */
export function weekProgress(plan: WeekPlan): readonly GroupProgress[] {
  const doneCount = new Map<string, number>()
  const plannedCount = new Map<string, number>()

  for (const day of [0, 1, 2, 3, 4, 5, 6] as DayIndex[]) {
    for (const slot of ['morning', 'evening'] as SlotKey[]) {
      for (const groupId of plan.schedule[day][slot]) {
        plannedCount.set(groupId, (plannedCount.get(groupId) ?? 0) + 1)
        if (plan.checked.includes(checkKey(day, slot, groupId))) {
          doneCount.set(groupId, (doneCount.get(groupId) ?? 0) + 1)
        }
      }
    }
  }

  return CATALOG.map((g) => ({
    groupId: g.id,
    name: g.name,
    done: doneCount.get(g.id) ?? 0,
    planned: plannedCount.get(g.id) ?? 0,
    target: g.targetSessions,
    tone: g.tone,
    targetAmount: g.targetAmount,
    unit: g.unit,
  }))
}

/** 本週整體完成率（已打勾格數 / 已排格數） */
export function overallProgress(plan: WeekPlan): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const day of [0, 1, 2, 3, 4, 5, 6] as DayIndex[]) {
    for (const slot of ['morning', 'evening'] as SlotKey[]) {
      for (const groupId of plan.schedule[day][slot]) {
        total += 1
        if (plan.checked.includes(checkKey(day, slot, groupId))) done += 1
      }
    }
  }
  return { done, total }
}

export { emptySchedule }

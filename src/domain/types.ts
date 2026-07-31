/** 部位的計量方式：組數 or 分鐘 or 小時 */
export type MetricUnit = 'sets' | 'minutes' | 'hours'

/** 一個訓練部位／項目 */
export interface MuscleGroup {
  readonly id: string
  readonly name: string
  /** 週目標的數量，例如 15（組）、30（分鐘）、3（小時） */
  readonly targetAmount: number
  readonly unit: MetricUnit
  /** 週目標時段數，例如「兩個時段」= 2 */
  readonly targetSessions: number
  /** UI 用的色票 token */
  readonly tone: Tone
}

export type Tone = 'indigo' | 'coral' | 'amber' | 'teal' | 'violet' | 'lime' | 'sky'

/** 一天的兩個時段 */
export type SlotKey = 'morning' | 'evening'

/** 一週七天，0 = 週一 … 6 = 週日（依 Bob 課表以週一為首） */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * 課表上的一格 = 某天某時段要練的項目清單。
 * 例：週一早上 = ['triceps-biceps', 'chest', 'shoulders']
 */
export type SlotPlan = readonly string[]

/** 一週的排程：7 天 × 2 時段 */
export type Schedule = {
  readonly [D in DayIndex]: {
    readonly [S in SlotKey]: SlotPlan
  }
}

/**
 * 打勾紀錄的 key：`${dayIndex}-${slot}-${groupId}`
 * 只打勾不記組數 —— 一格一個項目一個勾。
 */
export type CheckKey = string

export function checkKey(day: DayIndex, slot: SlotKey, groupId: string): CheckKey {
  return `${day}-${slot}-${groupId}`
}

/** 被替換掉、需要補做的項目 */
export interface MakeupItem {
  readonly groupId: string
  /** 原本被排在哪一天哪個時段 */
  readonly fromDay: DayIndex
  readonly fromSlot: SlotKey
  /** 使用者主動標記本週跳過，就不再提醒 */
  readonly dismissed: boolean
}

/** 使用者在「部位進度」建立、可排進本週課表的自訂訓練。 */
export interface ExtraActivity {
  readonly id: string
  readonly name: string
}

/** 某一週的完整狀態 */
export interface WeekPlan {
  /** ISO 週次 key，例：2026-W31 */
  readonly weekKey: string
  /** 本週的排程（可能已被單日替換過，與模板不同） */
  readonly schedule: Schedule
  /** 已完成的勾 */
  readonly checked: readonly CheckKey[]
  /** 因替換而欠下的補做項目 */
  readonly makeups: readonly MakeupItem[]
  /** 不屬於固定模板、但本週可排入課表的自訂訓練（舊資料可沒有此欄位）。 */
  readonly extraActivities?: readonly ExtraActivity[]
  readonly updatedAt: number
}

/** 使用者的長相模板（永久，每週套用） */
export interface Template {
  readonly schedule: Schedule
  readonly updatedAt: number
}

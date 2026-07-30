import type { MuscleGroup, Schedule } from './types'

/**
 * 部位庫 —— 依 Bob 的每週事項清單。
 * targetAmount/unit 是週目標總量，targetSessions 是要分幾個時段完成。
 */
export const CATALOG: readonly MuscleGroup[] = [
  { id: 'chest', name: '胸', targetAmount: 15, unit: 'sets', targetSessions: 2, tone: 'indigo' },
  { id: 'shoulders', name: '肩', targetAmount: 15, unit: 'sets', targetSessions: 2, tone: 'sky' },
  { id: 'back', name: '背', targetAmount: 15, unit: 'sets', targetSessions: 2, tone: 'violet' },
  { id: 'legs', name: '腿', targetAmount: 0, unit: 'sets', targetSessions: 2, tone: 'teal' },
  { id: 'arms', name: '二三頭', targetAmount: 20, unit: 'minutes', targetSessions: 2, tone: 'coral' },
  { id: 'abs', name: '腹肌', targetAmount: 30, unit: 'minutes', targetSessions: 2, tone: 'amber' },
  { id: 'hiit', name: '間歇', targetAmount: 20, unit: 'minutes', targetSessions: 2, tone: 'coral' },
  { id: 'cardio-class', name: '有氧課程', targetAmount: 1, unit: 'hours', targetSessions: 1, tone: 'lime' },
  { id: 'basketball', name: '籃球', targetAmount: 3, unit: 'hours', targetSessions: 1, tone: 'amber' },
  { id: 'squash', name: '壁球', targetAmount: 2, unit: 'hours', targetSessions: 1, tone: 'teal' },
  { id: 'cycling', name: '腳踏車', targetAmount: 2, unit: 'hours', targetSessions: 1, tone: 'lime' },
]

export const CATALOG_BY_ID: ReadonlyMap<string, MuscleGroup> = new Map(
  CATALOG.map((g) => [g.id, g]),
)

export function groupById(id: string): MuscleGroup | undefined {
  return CATALOG_BY_ID.get(id)
}

export const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const
export const SLOT_LABELS = { morning: '早上', evening: '晚上' } as const

/** 空白的一週 */
export function emptySchedule(): Schedule {
  return {
    0: { morning: [], evening: [] },
    1: { morning: [], evening: [] },
    2: { morning: [], evening: [] },
    3: { morning: [], evening: [] },
    4: { morning: [], evening: [] },
    5: { morning: [], evening: [] },
    6: { morning: [], evening: [] },
  }
}

/**
 * 預設模板 —— 一天分早上、晚上兩攤，不是全擠在早上。
 * 一 二三頭 / 胸肩　二 間歇 / 背　　三 腹肌 / 有氧課程
 * 四 二三頭 / 籃球　五 間歇 / 胸肩　六 腹肌 / 背　　日 休
 */
export function defaultSchedule(): Schedule {
  return {
    0: { morning: ['arms'], evening: ['chest', 'shoulders'] },
    1: { morning: ['hiit'], evening: ['back'] },
    2: { morning: ['abs'], evening: ['cardio-class'] },
    3: { morning: ['arms'], evening: ['basketball'] },
    4: { morning: ['hiit'], evening: ['chest', 'shoulders'] },
    5: { morning: ['abs'], evening: ['back'] },
    6: { morning: [], evening: [] },
  }
}

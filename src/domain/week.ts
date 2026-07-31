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

/**
 * 修復舊版曾留下的矛盾資料：同一項同時留在原格、又出現在本週補做。
 *
 * 補做紀錄已經明確記著 fromDay/fromSlot，所以它在原格就必須消失。
 * 只清精確的來源格；同一部位排在別天是合法的，不可一起刪掉。
 */
export function normalizeWeekPlan(plan: WeekPlan): WeekPlan {
  let schedule = plan.schedule
  let changed = false

  for (const makeup of plan.makeups) {
    const source = schedule[makeup.fromDay][makeup.fromSlot]
    if (!source.includes(makeup.groupId)) continue
    schedule = replaceSlot(
      schedule,
      makeup.fromDay,
      makeup.fromSlot,
      source.filter((groupId) => groupId !== makeup.groupId),
    )
    changed = true
  }

  return changed ? { ...plan, schedule } : plan
}

/** 同一毫秒連點也必須有嚴格遞增版本，否則遠端同 timestamp 可能反蓋本機。 */
function nextUpdatedAt(plan: WeekPlan): number {
  return Math.max(Date.now(), plan.updatedAt + 1)
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
    updatedAt: nextUpdatedAt(plan),
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
    updatedAt: nextUpdatedAt(plan),
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
    updatedAt: nextUpdatedAt(plan),
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
    updatedAt: nextUpdatedAt(plan),
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
    updatedAt: nextUpdatedAt(plan),
  }
}

/** 拖曳的來源：某格裡的某一項 */
export interface DragSource {
  readonly day: DayIndex
  readonly slot: SlotKey
  readonly groupId: string
}

/**
 * 拖曳的落點。指定 displaceGroupId = 要頂掉目標格裡的哪一項；
 * 不指定就是單純放進去（目標格還有空位時）。
 */
export interface DropTarget {
  readonly day: DayIndex
  readonly slot: SlotKey
  readonly displaceGroupId?: string
}

export interface MoveResult {
  readonly plan: WeekPlan
  /**
   * 被頂出來的項目 —— 它現在「在手上」，還沒進補做池。
   * 使用者可以再把它放到別格，或放到格線外移進補做池。
   */
  readonly displaced: string | null
}

/**
 * 把「目前不在課表上」的方塊放回某格。
 *
 * 來源可能是本週補做，也可能是剛被另一顆頂出來、仍黏在手上的項目。
 * 放回後會清掉同部位的補做提醒；若壓在既有方塊上，該方塊會接著黏到手上。
 */
export function placeDetachedGroup(
  plan: WeekPlan,
  groupId: string,
  to: DropTarget,
): MoveResult {
  const none = { plan, displaced: null }
  const targetItems = plan.schedule[to.day][to.slot]
  if (targetItems.includes(groupId)) return none

  const displaced =
    to.displaceGroupId && targetItems.includes(to.displaceGroupId) ? to.displaceGroupId : null
  // 每格 UI 最多兩顆；滿格時必須明確壓在其中一顆上，不能偷偷塞成第三顆。
  if (!displaced && targetItems.length >= 2) return none

  const nextTarget = displaced
    ? targetItems.map((item) => (item === displaced ? groupId : item))
    : [...targetItems, groupId]

  return {
    plan: {
      ...plan,
      schedule: replaceSlot(plan.schedule, to.day, to.slot, nextTarget),
      checked: displaced
        ? plan.checked.filter((key) => key !== checkKey(to.day, to.slot, displaced))
        : plan.checked,
      makeups: plan.makeups.filter((item) => item.groupId !== groupId),
      updatedAt: nextUpdatedAt(plan),
    },
    displaced,
  }
}

/**
 * 把一項從某格拖到另一格。
 *
 * 這是拖放的核心：跟 swapGroup（同一格內換成別的項目）不同，
 * 這裡是**跨格搬移**，而且被頂出來的那項不直接進補做池——
 * 它回傳給呼叫端黏在手上，等使用者決定放哪。
 */
export function moveGroup(plan: WeekPlan, from: DragSource, to: DropTarget): MoveResult {
  const none = { plan, displaced: null }

  const source = plan.schedule[from.day][from.slot]
  if (!source.includes(from.groupId)) return none

  // 原地放下 = 沒事發生
  if (from.day === to.day && from.slot === to.slot) return none

  const targetItems = plan.schedule[to.day][to.slot]
  // 目標格已經有同一項 → 不做事，避免同一格出現兩個一樣的
  if (targetItems.includes(from.groupId)) return none

  const displaced =
    to.displaceGroupId && targetItems.includes(to.displaceGroupId) ? to.displaceGroupId : null

  const wasChecked = plan.checked.includes(checkKey(from.day, from.slot, from.groupId))

  const nextSource = source.filter((g) => g !== from.groupId)
  const nextTarget = displaced
    ? targetItems.map((g) => (g === displaced ? from.groupId : g))
    : [...targetItems, from.groupId]

  let schedule = replaceSlot(plan.schedule, from.day, from.slot, nextSource)
  schedule = replaceSlot(schedule, to.day, to.slot, nextTarget)

  // 勾跟著項目搬家：做過就是做過，換位置不該讓它變沒做。
  // 被頂出來那項的勾要清掉——它已經不在課表上了。
  const checked = plan.checked
    .filter((k) => k !== checkKey(from.day, from.slot, from.groupId))
    .filter((k) => (displaced ? k !== checkKey(to.day, to.slot, displaced) : true))

  return {
    plan: {
      ...plan,
      schedule,
      checked: wasChecked ? [...checked, checkKey(to.day, to.slot, from.groupId)] : checked,
      // 搬進來的項目若原本欠著，視為補回
      makeups: plan.makeups.filter((m) => m.groupId !== from.groupId),
      updatedAt: nextUpdatedAt(plan),
    },
    displaced,
  }
}

/**
 * 手上的項目放到 7 天 × 早晚格線外：
 * 從原格消失，沒做完的移進本週補做。
 *
 * 被頂出來的項目可能已經不在 schedule，仍要能進補做池。
 */
export function dropToMakeup(
  plan: WeekPlan,
  groupId: string,
  fromDay: DayIndex,
  fromSlot: SlotKey,
): WeekPlan {
  const source = plan.schedule[fromDay][fromSlot]
  const nextSource = source.filter((item) => item !== groupId)
  const key = checkKey(fromDay, fromSlot, groupId)
  const wasChecked = plan.checked.includes(key)
  const checked = plan.checked.filter((item) => item !== key)
  const existingMakeups = plan.makeups.filter(
    (item) =>
      !(
        item.groupId === groupId &&
        item.fromDay === fromDay &&
        item.fromSlot === fromSlot
      ),
  )
  const makeups = wasChecked
    ? existingMakeups
    : [...existingMakeups, { groupId, fromDay, fromSlot, dismissed: false }]

  return {
    ...plan,
    schedule: replaceSlot(plan.schedule, fromDay, fromSlot, nextSource),
    checked,
    makeups,
    updatedAt: nextUpdatedAt(plan),
  }
}

/** 標記某補做項目本週跳過 */
export function dismissMakeup(plan: WeekPlan, groupId: string): WeekPlan {
  return {
    ...plan,
    makeups: plan.makeups.map((m) =>
      m.groupId === groupId ? { ...m, dismissed: true } : m,
    ),
    updatedAt: nextUpdatedAt(plan),
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

/** ---------- 多裝置合併 ---------- */

/**
 * 合併兩台裝置的同一週資料。
 *
 * 為什麼不能只比 updatedAt：那是整份文件的 last-write-wins。實測過——
 * 手機離線打「週一早上」、電腦離線打「週二早上」，後同步的那台會把先同步的
 * 整份蓋掉，先打的那個勾就這樣消失，而且使用者完全沒有感覺。打勾代表真的做過
 * 的訓練，掉一個就是掉一次紀錄。
 *
 * `checked` 的合併分兩種：
 * - 一份是另一份的子集合：代表單純新增或取消，採用 updatedAt 較新的完整狀態。
 * - 兩份各有對方沒有的勾：代表兩台離線期間各自新增，才取聯集保住兩邊紀錄。
 *
 * 這樣在線 realtime 的取消不會被舊勾復活，同時仍保住最常見的離線並行新增。
 *
 * `schedule` 與 `makeups` 仍走 last-write-wins：它們是整體排版，
 * 逐項合併會生出兩台都沒排過的第三種課表，比直接取較新的更難理解。
 */
export function mergeWeekPlans(a: WeekPlan, b: WeekPlan): WeekPlan {
  const newer = normalizeWeekPlan(b.updatedAt >= a.updatedAt ? b : a)
  const aKeys = new Set(a.checked)
  const bKeys = new Set(b.checked)
  const aIsSubset = a.checked.every((key) => bKeys.has(key))
  const bIsSubset = b.checked.every((key) => aKeys.has(key))
  const merged =
    aIsSubset || bIsSubset
      ? [...newer.checked]
      : [...new Set([...a.checked, ...b.checked])]

  // 只留還排在課表上、或還欠著補做的勾——被移除的項目不該靠合併復活
  const alive = new Set<string>()
  for (const day of [0, 1, 2, 3, 4, 5, 6] as DayIndex[]) {
    for (const slot of ['morning', 'evening'] as SlotKey[]) {
      for (const groupId of newer.schedule[day][slot]) alive.add(checkKey(day, slot, groupId))
    }
  }
  for (const m of newer.makeups) alive.add(checkKey(m.fromDay, m.fromSlot, m.groupId))

  const checked = merged.filter((k) => alive.has(k))

  return { ...newer, checked }
}

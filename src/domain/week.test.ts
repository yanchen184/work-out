import { describe, expect, it } from 'vitest'
import {
  addToSlot,
  createWeekPlan,
  dismissMakeup,
  formatWeekRange,
  mondayOfWeekKey,
  overallProgress,
  removeFromSlot,
  setSlotChecked,
  shiftWeekKey,
  startOfWeek,
  swapGroup,
  toggleCheck,
  weekKeyOf,
  weekProgress,
} from './week'
import { defaultSchedule, emptySchedule } from './catalog'
import { checkKey } from './types'

describe('startOfWeek — 週一為首', () => {
  it('週三回推到當週週一', () => {
    // 2026-07-29 是週三
    expect(startOfWeek(new Date(2026, 6, 29)).getDate()).toBe(27)
  })

  it('週日回推到當週週一（不是隔週）', () => {
    // 2026-08-02 是週日 → 該週週一是 07-27
    const monday = startOfWeek(new Date(2026, 7, 2))
    expect(monday.getMonth()).toBe(6)
    expect(monday.getDate()).toBe(27)
  })

  it('週一本身不位移', () => {
    expect(startOfWeek(new Date(2026, 6, 27)).getDate()).toBe(27)
  })
})

describe('weekKeyOf — ISO 週次', () => {
  it('同一週的不同天得到同一個 key', () => {
    const mon = weekKeyOf(new Date(2026, 6, 27))
    const sun = weekKeyOf(new Date(2026, 7, 2))
    expect(mon).toBe(sun)
  })

  it('相鄰週得到不同 key', () => {
    expect(weekKeyOf(new Date(2026, 6, 27))).not.toBe(weekKeyOf(new Date(2026, 7, 3)))
  })

  it('格式為 YYYY-Www', () => {
    expect(weekKeyOf(new Date(2026, 6, 29))).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('跨年邊界：週次 key 可以來回轉換', () => {
    for (const d of [new Date(2025, 11, 29), new Date(2026, 0, 1), new Date(2026, 0, 4)]) {
      const key = weekKeyOf(d)
      // 由 key 推回的週一，其所屬週次必須還是同一個 key
      expect(weekKeyOf(mondayOfWeekKey(key))).toBe(key)
    }
  })

  it('shiftWeekKey 前後移動一週', () => {
    const base = new Date(2026, 6, 29)
    expect(shiftWeekKey(base, 0)).toBe(weekKeyOf(base))
    expect(shiftWeekKey(base, 1)).toBe(weekKeyOf(new Date(2026, 7, 5)))
    expect(shiftWeekKey(base, -1)).toBe(weekKeyOf(new Date(2026, 6, 22)))
  })

  it('formatWeekRange 給出可讀日期範圍', () => {
    expect(formatWeekRange('2026-W31')).toMatch(/^\d+\/\d+ – \d+\/\d+$/)
  })
})

describe('toggleCheck — 打勾', () => {
  it('打勾後再點一次會取消', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const once = toggleCheck(plan, 0, 'morning', 'chest')
    expect(once.checked).toContain(checkKey(0, 'morning', 'chest'))

    const twice = toggleCheck(once, 0, 'morning', 'chest')
    expect(twice.checked).not.toContain(checkKey(0, 'morning', 'chest'))
  })

  it('不同時段的同一部位各自獨立', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const p = toggleCheck(plan, 0, 'morning', 'chest')
    expect(p.checked).toContain(checkKey(0, 'morning', 'chest'))
    expect(p.checked).not.toContain(checkKey(4, 'morning', 'chest'))
  })

  it('不可變：原本的 plan 不被修改', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    toggleCheck(plan, 0, 'morning', 'chest')
    expect(plan.checked).toHaveLength(0)
  })
})

describe('swapGroup — 單日替換與補做池', () => {
  it('未打勾的項目被換掉 → 進補做池', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = swapGroup(plan, 1, 'morning', 'back', 'legs')

    expect(next.schedule[1].morning).toContain('legs')
    expect(next.schedule[1].morning).not.toContain('back')
    expect(next.makeups.map((m) => m.groupId)).toContain('back')
  })

  it('已打勾的項目被換掉 → 不進補做池（已經做過了）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const checked = toggleCheck(plan, 1, 'morning', 'back')
    const next = swapGroup(checked, 1, 'morning', 'back', 'legs')

    expect(next.makeups.map((m) => m.groupId)).not.toContain('back')
  })

  it('替換後舊項目的勾要清掉，新項目從未打勾開始', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const checked = toggleCheck(plan, 1, 'morning', 'back')
    const next = swapGroup(checked, 1, 'morning', 'back', 'legs')

    expect(next.checked).not.toContain(checkKey(1, 'morning', 'back'))
    expect(next.checked).not.toContain(checkKey(1, 'morning', 'legs'))
  })

  it('換成已存在同格的項目 → 不動作（避免重複）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 週一早上已有 chest 與 shoulders
    const next = swapGroup(plan, 0, 'morning', 'chest', 'shoulders')
    expect(next).toBe(plan)
  })

  it('來源項目不在該格 → 不動作', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = swapGroup(plan, 0, 'morning', 'squash', 'legs')
    expect(next).toBe(plan)
  })

  it('同一格重複替換不會產生重複的補做項目', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const a = swapGroup(plan, 1, 'morning', 'back', 'legs')
    const b = swapGroup(a, 1, 'morning', 'legs', 'squash')
    const backEntries = b.makeups.filter((m) => m.groupId === 'back')
    expect(backEntries).toHaveLength(1)
  })
})

describe('addToSlot / removeFromSlot', () => {
  it('新增項目到空的晚上時段', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = addToSlot(plan, 0, 'evening', 'legs')
    expect(next.schedule[0].evening).toEqual(['legs'])
  })

  it('重複新增同一項目不會產生兩份', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const once = addToSlot(plan, 0, 'evening', 'legs')
    const twice = addToSlot(once, 0, 'evening', 'legs')
    expect(twice.schedule[0].evening).toEqual(['legs'])
  })

  it('把補做池的項目排回課表 → 該補做項目消失', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const removed = removeFromSlot(plan, 1, 'morning', 'back')
    expect(removed.makeups.map((m) => m.groupId)).toContain('back')

    const restored = addToSlot(removed, 5, 'evening', 'back')
    expect(restored.makeups.map((m) => m.groupId)).not.toContain('back')
  })

  it('移除未打勾的項目 → 進補做池', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = removeFromSlot(plan, 2, 'morning', 'abs')
    expect(next.schedule[2].morning).not.toContain('abs')
    expect(next.makeups.map((m) => m.groupId)).toContain('abs')
  })

  it('移除不存在的項目 → 不動作', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    expect(removeFromSlot(plan, 2, 'morning', 'squash')).toBe(plan)
  })
})

describe('dismissMakeup — 本週跳過', () => {
  it('標記跳過後 dismissed 為 true', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const removed = removeFromSlot(plan, 1, 'morning', 'back')
    const dismissed = dismissMakeup(removed, 'back')
    expect(dismissed.makeups.find((m) => m.groupId === 'back')?.dismissed).toBe(true)
  })
})

describe('weekProgress — 部位進度', () => {
  it('預設課表：胸排了兩個時段，符合目標', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const chest = weekProgress(plan).find((p) => p.groupId === 'chest')!
    expect(chest.planned).toBe(2)
    expect(chest.target).toBe(2)
    expect(chest.done).toBe(0)
  })

  it('打勾後 done 增加', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const checked = toggleCheck(plan, 0, 'morning', 'chest')
    const chest = weekProgress(checked).find((p) => p.groupId === 'chest')!
    expect(chest.done).toBe(1)
  })

  it('預設課表沒排到的項目 planned 為 0（腿/壁球/腳踏車）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const progress = weekProgress(plan)
    for (const id of ['legs', 'squash', 'cycling']) {
      expect(progress.find((p) => p.groupId === id)!.planned).toBe(0)
    }
  })

  it('11 個部位全部都要出現在進度列表', () => {
    const plan = createWeekPlan('2026-W31', emptySchedule())
    expect(weekProgress(plan)).toHaveLength(11)
  })

  it('空課表所有進度為 0', () => {
    const plan = createWeekPlan('2026-W31', emptySchedule())
    for (const p of weekProgress(plan)) {
      expect(p.done).toBe(0)
      expect(p.planned).toBe(0)
    }
  })
})

describe('overallProgress — 整體完成率', () => {
  it('空課表 total 為 0（不應除以零）', () => {
    const plan = createWeekPlan('2026-W31', emptySchedule())
    expect(overallProgress(plan)).toEqual({ done: 0, total: 0 })
  })

  it('預設課表 total 等於所有格子的項目總數', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 3+2+2+2+3+2 = 14
    expect(overallProgress(plan).total).toBe(14)
  })

  it('全部打勾後 done 等於 total', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    for (const day of [0, 1, 2, 3, 4, 5, 6] as const) {
      for (const slot of ['morning', 'evening'] as const) {
        for (const g of plan.schedule[day][slot]) {
          plan = toggleCheck(plan, day, slot, g)
        }
      }
    }
    const { done, total } = overallProgress(plan)
    expect(done).toBe(total)
  })
})

describe('setSlotChecked — 整段一次打勾', () => {
  it('一次呼叫就把整段三個項目全部打勾', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 週一早上 = 二三頭 / 胸 / 肩
    const next = setSlotChecked(plan, 0, 'morning', true)
    expect(next.checked).toContain(checkKey(0, 'morning', 'arms'))
    expect(next.checked).toContain(checkKey(0, 'morning', 'chest'))
    expect(next.checked).toContain(checkKey(0, 'morning', 'shoulders'))
    expect(next.checked).toHaveLength(3)
  })

  it('取消整段只清掉該段的 key，不動其他段', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    plan = setSlotChecked(plan, 0, 'morning', true)
    plan = setSlotChecked(plan, 1, 'morning', true)
    const next = setSlotChecked(plan, 0, 'morning', false)

    expect(next.checked).not.toContain(checkKey(0, 'morning', 'chest'))
    expect(next.checked).toContain(checkKey(1, 'morning', 'hiit'))
    expect(next.checked).toContain(checkKey(1, 'morning', 'back'))
  })

  it('部分已打勾時，設 true 會補齊剩下的（不會重複）', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    plan = toggleCheck(plan, 0, 'morning', 'chest')
    const next = setSlotChecked(plan, 0, 'morning', true)
    expect(next.checked).toHaveLength(3)
    expect(new Set(next.checked).size).toBe(3)
  })

  it('已是目標狀態就原樣返回', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    expect(setSlotChecked(plan, 0, 'morning', false)).toBe(plan)
    const done = setSlotChecked(plan, 0, 'morning', true)
    expect(setSlotChecked(done, 0, 'morning', true)).toBe(done)
  })

  it('空時段不做事', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    expect(setSlotChecked(plan, 0, 'evening', true)).toBe(plan)
  })

  it('不動到原本的 plan（immutability）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    setSlotChecked(plan, 0, 'morning', true)
    expect(plan.checked).toHaveLength(0)
  })
})

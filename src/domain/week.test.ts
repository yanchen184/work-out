import { describe, expect, it } from 'vitest'
import {
  addToSlot,
  createWeekPlan,
  dismissMakeup,
  dropToMakeup,
  formatWeekRange,
  mergeWeekPlans,
  mondayOfWeekKey,
  moveGroup,
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
    const once = toggleCheck(plan, 0, 'evening', 'chest')
    expect(once.checked).toContain(checkKey(0, 'evening', 'chest'))

    const twice = toggleCheck(once, 0, 'evening', 'chest')
    expect(twice.checked).not.toContain(checkKey(0, 'evening', 'chest'))
  })

  it('不同時段的同一部位各自獨立', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const p = toggleCheck(plan, 0, 'evening', 'chest')
    expect(p.checked).toContain(checkKey(0, 'evening', 'chest'))
    expect(p.checked).not.toContain(checkKey(4, 'evening', 'chest'))
  })

  it('不可變：原本的 plan 不被修改', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    toggleCheck(plan, 0, 'evening', 'chest')
    expect(plan.checked).toHaveLength(0)
  })
})

describe('swapGroup — 單日替換與補做池', () => {
  it('未打勾的項目被換掉 → 進補做池', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = swapGroup(plan, 1, 'evening', 'back', 'legs')

    expect(next.schedule[1].evening).toContain('legs')
    expect(next.schedule[1].evening).not.toContain('back')
    expect(next.makeups.map((m) => m.groupId)).toContain('back')
  })

  it('已打勾的項目被換掉 → 不進補做池（已經做過了）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const checked = toggleCheck(plan, 1, 'evening', 'back')
    const next = swapGroup(checked, 1, 'evening', 'back', 'legs')

    expect(next.makeups.map((m) => m.groupId)).not.toContain('back')
  })

  it('替換後舊項目的勾要清掉，新項目從未打勾開始', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const checked = toggleCheck(plan, 1, 'evening', 'back')
    const next = swapGroup(checked, 1, 'evening', 'back', 'legs')

    expect(next.checked).not.toContain(checkKey(1, 'evening', 'back'))
    expect(next.checked).not.toContain(checkKey(1, 'evening', 'legs'))
  })

  it('換成已存在同格的項目 → 不動作（避免重複）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 週一晚上已有 chest 與 shoulders
    const next = swapGroup(plan, 0, 'evening', 'chest', 'shoulders')
    expect(next).toBe(plan)
  })

  it('來源項目不在該格 → 不動作', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = swapGroup(plan, 0, 'morning', 'squash', 'legs')
    expect(next).toBe(plan)
  })

  it('同一格重複替換不會產生重複的補做項目', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const a = swapGroup(plan, 1, 'evening', 'back', 'legs')
    const b = swapGroup(a, 1, 'evening', 'legs', 'squash')
    const backEntries = b.makeups.filter((m) => m.groupId === 'back')
    expect(backEntries).toHaveLength(1)
  })
})

describe('addToSlot / removeFromSlot', () => {
  it('新增項目到空的時段（週日整天沒排）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = addToSlot(plan, 6, 'evening', 'legs')
    expect(next.schedule[6].evening).toEqual(['legs'])
  })

  it('重複新增同一項目不會產生兩份', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const once = addToSlot(plan, 6, 'evening', 'legs')
    const twice = addToSlot(once, 6, 'evening', 'legs')
    expect(twice.schedule[6].evening).toEqual(['legs'])
  })

  it('把補做池的項目排回課表 → 該補做項目消失', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const removed = removeFromSlot(plan, 1, 'evening', 'back')
    expect(removed.makeups.map((m) => m.groupId)).toContain('back')

    // 排到週日（沒排東西的那天），確認補做項目被銷掉
    const restored = addToSlot(removed, 6, 'evening', 'back')
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
    const removed = removeFromSlot(plan, 1, 'evening', 'back')
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
    const checked = toggleCheck(plan, 0, 'evening', 'chest')
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
  it('一次呼叫就把整段的項目全部打勾', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 週一晚上 = 胸 / 肩
    const next = setSlotChecked(plan, 0, 'evening', true)
    expect(next.checked).toContain(checkKey(0, 'evening', 'chest'))
    expect(next.checked).toContain(checkKey(0, 'evening', 'shoulders'))
    expect(next.checked).toHaveLength(2)
  })

  it('取消整段只清掉該段的 key，不動其他段', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    plan = setSlotChecked(plan, 0, 'evening', true)
    plan = setSlotChecked(plan, 1, 'morning', true)
    const next = setSlotChecked(plan, 0, 'evening', false)

    expect(next.checked).not.toContain(checkKey(0, 'evening', 'chest'))
    expect(next.checked).toContain(checkKey(1, 'morning', 'hiit'))
  })

  it('部分已打勾時，設 true 會補齊剩下的（不會重複）', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    plan = toggleCheck(plan, 0, 'evening', 'chest')
    const next = setSlotChecked(plan, 0, 'evening', true)
    expect(next.checked).toHaveLength(2)
    expect(new Set(next.checked).size).toBe(2)
  })

  it('已是目標狀態就原樣返回', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    expect(setSlotChecked(plan, 0, 'morning', false)).toBe(plan)
    const done = setSlotChecked(plan, 0, 'morning', true)
    expect(setSlotChecked(done, 0, 'morning', true)).toBe(done)
  })

  it('空時段不做事', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 週日整天沒排東西
    expect(setSlotChecked(plan, 6, 'morning', true)).toBe(plan)
  })

  it('不動到原本的 plan（immutability）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    setSlotChecked(plan, 0, 'morning', true)
    expect(plan.checked).toHaveLength(0)
  })
})

describe('moveGroup — 拖放：拿起來放到別格', () => {
  // 預設：週一早 = arms；週一晚 = chest, shoulders；週二早 = hiit；週日 = 整天空

  it('拖到空格 → 單純搬過去，手上不留東西', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const r = moveGroup(plan, { day: 0, slot: 'morning', groupId: 'arms' }, { day: 6, slot: 'morning' })

    expect(r.plan.schedule[0].morning).not.toContain('arms')
    expect(r.plan.schedule[6].morning).toContain('arms')
    expect(r.displaced).toBeNull()
  })

  it('拖到空格不算欠 → 不進補做池（只是換位置，不是不做）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const r = moveGroup(plan, { day: 0, slot: 'morning', groupId: 'arms' }, { day: 6, slot: 'morning' })
    expect(r.plan.makeups.map((m) => m.groupId)).not.toContain('arms')
  })

  it('拖到已滿的目標格 → 交換，被頂出的項目回傳到手上', () => {
    // 週一早的 arms 拖到週二早，指定頂掉 hiit
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const r = moveGroup(
      plan,
      { day: 0, slot: 'morning', groupId: 'arms' },
      { day: 1, slot: 'morning', displaceGroupId: 'hiit' },
    )

    expect(r.plan.schedule[1].morning).toContain('arms')
    expect(r.plan.schedule[1].morning).not.toContain('hiit')
    expect(r.plan.schedule[0].morning).not.toContain('arms')
    expect(r.displaced).toBe('hiit')
  })

  it('被頂出來的項目還沒進補做池 —— 它在手上，等使用者決定放哪', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const r = moveGroup(
      plan,
      { day: 0, slot: 'morning', groupId: 'arms' },
      { day: 1, slot: 'morning', displaceGroupId: 'hiit' },
    )
    expect(r.plan.makeups.map((m) => m.groupId)).not.toContain('hiit')
  })

  it('拖曳的項目已打勾 → 勾跟著搬到新位置（做過就是做過）', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    plan = toggleCheck(plan, 0, 'morning', 'arms')
    expect(plan.checked).toContain(checkKey(0, 'morning', 'arms'))

    const r = moveGroup(plan, { day: 0, slot: 'morning', groupId: 'arms' }, { day: 6, slot: 'morning' })

    expect(r.plan.checked).not.toContain(checkKey(0, 'morning', 'arms'))
    expect(r.plan.checked).toContain(checkKey(6, 'morning', 'arms'))
  })

  it('目標格已經有同一項 → 不動作（不會出現兩個一樣的）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    // 週四早也是 arms，把週一早的 arms 拖過去應該不動
    const r = moveGroup(plan, { day: 0, slot: 'morning', groupId: 'arms' }, { day: 3, slot: 'morning' })
    expect(r.plan).toBe(plan)
    expect(r.displaced).toBeNull()
  })

  it('原地拖放（同一格）→ 不動作', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const r = moveGroup(plan, { day: 0, slot: 'morning', groupId: 'arms' }, { day: 0, slot: 'morning' })
    expect(r.plan).toBe(plan)
    expect(r.displaced).toBeNull()
  })

  it('來源格根本沒這一項 → 不動作', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const r = moveGroup(plan, { day: 0, slot: 'morning', groupId: 'chest' }, { day: 6, slot: 'evening' })
    expect(r.plan).toBe(plan)
  })

  it('不動到原本的 plan（immutability）', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const before = [...plan.schedule[0].morning]
    moveGroup(plan, { day: 0, slot: 'morning', groupId: 'arms' }, { day: 6, slot: 'morning' })
    expect(plan.schedule[0].morning).toEqual(before)
    expect(plan.schedule[6].morning).toHaveLength(0)
  })
})

describe('dropToMakeup — 手上的項目放到空白處 → 進補做', () => {
  it('沒打勾的項目 → 進補做池，記住原本在哪', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const next = dropToMakeup(plan, 'back', 1, 'evening')

    const m = next.makeups.find((x) => x.groupId === 'back')
    expect(m).toBeDefined()
    expect(m?.fromDay).toBe(1)
    expect(m?.fromSlot).toBe('evening')
    expect(m?.dismissed).toBe(false)
  })

  it('已打勾的項目 → 不進補做池（已經做過了，不算欠）', () => {
    let plan = createWeekPlan('2026-W31', defaultSchedule())
    plan = toggleCheck(plan, 1, 'evening', 'back')
    const next = dropToMakeup(plan, 'back', 1, 'evening')
    expect(next.makeups.map((m) => m.groupId)).not.toContain('back')
  })

  it('同一項不會在補做池重複兩筆', () => {
    const plan = createWeekPlan('2026-W31', defaultSchedule())
    const once = dropToMakeup(plan, 'back', 1, 'evening')
    const twice = dropToMakeup(once, 'back', 1, 'evening')
    expect(twice.makeups.filter((m) => m.groupId === 'back')).toHaveLength(1)
  })
})

describe('mergeWeekPlans — 兩台裝置各自離線打勾', () => {
  const base = createWeekPlan('2026-W31', defaultSchedule())

  it('兩台打不同的勾 → 聯集，兩個都留著', () => {
    // 這正是實測會掉資料的情境：手機打週一早上、電腦打週二早上
    const a = { ...toggleCheck(base, 0, 'morning', 'arms'), updatedAt: 1000 }
    const b = { ...toggleCheck(base, 1, 'morning', 'hiit'), updatedAt: 2000 }

    const merged = mergeWeekPlans(a, b)
    expect(merged.checked).toContain(checkKey(0, 'morning', 'arms'))
    expect(merged.checked).toContain(checkKey(1, 'morning', 'hiit'))
  })

  it('合併順序不影響結果（誰先誰後都一樣）', () => {
    const a = { ...toggleCheck(base, 0, 'morning', 'arms'), updatedAt: 1000 }
    const b = { ...toggleCheck(base, 1, 'morning', 'hiit'), updatedAt: 2000 }

    expect([...mergeWeekPlans(a, b).checked].sort()).toEqual(
      [...mergeWeekPlans(b, a).checked].sort(),
    )
  })

  it('兩台打同一個勾 → 不會變成兩筆', () => {
    const a = { ...toggleCheck(base, 0, 'morning', 'arms'), updatedAt: 1000 }
    const b = { ...toggleCheck(base, 0, 'morning', 'arms'), updatedAt: 2000 }

    expect(mergeWeekPlans(a, b).checked).toEqual([checkKey(0, 'morning', 'arms')])
  })

  it('schedule 取較新的那份（整體排版不逐項合併）', () => {
    const a = { ...base, updatedAt: 1000 }
    const b = { ...removeFromSlot(base, 3, 'evening', 'basketball'), updatedAt: 2000 }

    expect(mergeWeekPlans(a, b).schedule[3].evening).not.toContain('basketball')
  })

  it('較新那份已經移除的項目 → 舊的勾不會靠合併復活', () => {
    // A 打了籃球的勾；B 之後把籃球整個從課表移掉（也沒進補做池）
    const a = { ...toggleCheck(base, 3, 'evening', 'basketball'), updatedAt: 1000 }
    const removed = removeFromSlot(base, 3, 'evening', 'basketball')
    const b = { ...removed, makeups: [], updatedAt: 2000 }

    expect(mergeWeekPlans(a, b).checked).not.toContain(checkKey(3, 'evening', 'basketball'))
  })

  it('項目被換走但還欠在補做池 → 那個勾要留著', () => {
    const a = { ...toggleCheck(base, 1, 'evening', 'back'), updatedAt: 1000 }
    const b = { ...dropToMakeup(base, 'back', 1, 'evening'), updatedAt: 2000 }

    const merged = mergeWeekPlans(a, b)
    expect(merged.checked).toContain(checkKey(1, 'evening', 'back'))
  })

  it('不改動傳進來的兩份計畫（immutability）', () => {
    const a = { ...toggleCheck(base, 0, 'morning', 'arms'), updatedAt: 1000 }
    const b = { ...toggleCheck(base, 1, 'morning', 'hiit'), updatedAt: 2000 }
    const aBefore = [...a.checked]
    const bBefore = [...b.checked]

    mergeWeekPlans(a, b)
    expect(a.checked).toEqual(aBefore)
    expect(b.checked).toEqual(bBefore)
  })
})

import { describe, expect, it } from 'vitest'
import { isSchedule, isTemplate, isWeekPlan } from './schema'
import { defaultSchedule } from '../domain/catalog'
import { createWeekPlan } from '../domain/week'

const SCHEDULE = defaultSchedule()
const WEEK = createWeekPlan('2026-W31', SCHEDULE)
const TEMPLATE = { schedule: SCHEDULE, updatedAt: 1_700_000_000_000 }

describe('isSchedule', () => {
  it('接受真正的預設模板', () => {
    expect(isSchedule(SCHEDULE)).toBe(true)
  })

  it('接受 JSON round-trip 後的模板——雲端讀回來就是這個形狀', () => {
    expect(isSchedule(JSON.parse(JSON.stringify(SCHEDULE)))).toBe(true)
  })

  it('少一天就不合格', () => {
    const missing = JSON.parse(JSON.stringify(SCHEDULE))
    delete missing['6']
    expect(isSchedule(missing)).toBe(false)
  })

  it('少一個時段就不合格', () => {
    const missing = JSON.parse(JSON.stringify(SCHEDULE))
    delete missing['0'].evening
    expect(isSchedule(missing)).toBe(false)
  })

  it('時段裡混進非字串就不合格', () => {
    const dirty = JSON.parse(JSON.stringify(SCHEDULE))
    dirty['0'].morning = ['chest', 42]
    expect(isSchedule(dirty)).toBe(false)
  })

  it('null / 陣列 / 字串都不是 schedule', () => {
    expect(isSchedule(null)).toBe(false)
    expect(isSchedule([])).toBe(false)
    expect(isSchedule('schedule')).toBe(false)
  })
})

describe('isWeekPlan', () => {
  it('接受真的週計畫（JSON round-trip 後）', () => {
    expect(isWeekPlan(JSON.parse(JSON.stringify(WEEK)))).toBe(true)
  })

  it('缺 weekKey 不合格', () => {
    expect(isWeekPlan({ ...WEEK, weekKey: undefined })).toBe(false)
  })

  it('weekKey 空字串不合格', () => {
    expect(isWeekPlan({ ...WEEK, weekKey: '' })).toBe(false)
  })

  it('checked 不是字串陣列就不合格', () => {
    expect(isWeekPlan({ ...WEEK, checked: 'nope' })).toBe(false)
    expect(isWeekPlan({ ...WEEK, checked: [1, 2] })).toBe(false)
  })

  it('makeups 內容形狀不對就不合格', () => {
    expect(isWeekPlan({ ...WEEK, makeups: [{ groupId: 'chest' }] })).toBe(false)
  })

  it('makeups 的 fromDay 超出 0-6 不合格', () => {
    const bad = {
      ...WEEK,
      makeups: [{ groupId: 'chest', fromDay: 9, fromSlot: 'morning', dismissed: false }],
    }
    expect(isWeekPlan(bad)).toBe(false)
  })

  it('接受合法的 makeups', () => {
    const ok = {
      ...JSON.parse(JSON.stringify(WEEK)),
      makeups: [{ groupId: 'chest', fromDay: 2, fromSlot: 'evening', dismissed: false }],
    }
    expect(isWeekPlan(ok)).toBe(true)
  })

  it('updatedAt 不是有限數字就不合格', () => {
    expect(isWeekPlan({ ...WEEK, updatedAt: 'now' })).toBe(false)
    expect(isWeekPlan({ ...WEEK, updatedAt: NaN })).toBe(false)
  })

  it('半截文件（只有 weekKey）不合格——寫到一半斷線會長這樣', () => {
    expect(isWeekPlan({ weekKey: '2026-W31' })).toBe(false)
  })

  it('空物件、null 不合格', () => {
    expect(isWeekPlan({})).toBe(false)
    expect(isWeekPlan(null)).toBe(false)
  })
})

describe('isTemplate', () => {
  it('接受真的模板', () => {
    expect(isTemplate(JSON.parse(JSON.stringify(TEMPLATE)))).toBe(true)
  })

  it('schedule 壞掉不合格', () => {
    expect(isTemplate({ schedule: {}, updatedAt: 1 })).toBe(false)
  })

  it('缺 updatedAt 不合格', () => {
    expect(isTemplate({ schedule: SCHEDULE })).toBe(false)
  })

  it('空物件、null 不合格', () => {
    expect(isTemplate({})).toBe(false)
    expect(isTemplate(null)).toBe(false)
  })
})

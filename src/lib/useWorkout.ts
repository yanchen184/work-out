import { useCallback, useEffect, useRef, useState } from 'react'
import type { DayIndex, Schedule, SlotKey, WeekPlan } from '../domain/types'
import {
  addToSlot,
  dismissMakeup,
  removeFromSlot,
  setSlotChecked,
  shiftWeekKey,
  swapGroup,
  toggleCheck,
  weekKeyOf,
} from '../domain/week'
import { defaultSchedule } from '../domain/catalog'
import { firebaseEnabled, watchAuth } from './firebase'
import {
  loadTemplate,
  loadWeek,
  localUid,
  saveTemplate,
  saveWeek,
  saveWeekLocal,
} from './store'

export interface WorkoutState {
  readonly uid: string | null
  readonly isAnonymous: boolean
  /** 真的登入成功、資料會進雲端才是 true。設定填了但登入失敗時是 false。 */
  readonly cloudReady: boolean
  readonly weekOffset: number
  readonly weekKey: string
  readonly plan: WeekPlan | null
  readonly template: Schedule
  readonly loading: boolean
  readonly syncing: boolean
}

export function useWorkout() {
  const [uid, setUid] = useState<string | null>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [plan, setPlan] = useState<WeekPlan | null>(null)
  const [template, setTemplate] = useState<Schedule>(defaultSchedule)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const weekKey = shiftWeekKey(new Date(), weekOffset)
  const saveTimer = useRef<number | undefined>(undefined)

  // 登入
  useEffect(() => {
    if (!firebaseEnabled) {
      setUid(localUid())
      setIsAnonymous(true)
      setCloudReady(false)
      return
    }
    return watchAuth((state) => {
      if (state.user) {
        setUid(state.user.uid)
        setIsAnonymous(state.isAnonymous)
        setCloudReady(true)
      } else if (state.ready) {
        // 匿名登入失敗 → 退回本機。設定有填不代表雲端通了，
        // 這裡要把 cloudReady 壓回 false，否則畫面會謊稱「已同步雲端」。
        setUid(localUid())
        setIsAnonymous(true)
        setCloudReady(false)
      }
    })
  }, [])

  // 載入模板
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void loadTemplate(uid).then((t) => {
      if (!cancelled) setTemplate(t.schedule)
    })
    return () => {
      cancelled = true
    }
  }, [uid])

  // 載入該週
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setLoading(true)
    void loadWeek(uid, weekKey, template).then((w) => {
      if (!cancelled) {
        setPlan(w)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [uid, weekKey, template])

  /**
   * 改動後存檔：本機立刻寫，雲端 debounce。
   * 本機不能延遲——切週 / 關頁面都會讓還沒到期的 timer 失效，資料就掉了。
   */
  const persist = useCallback(
    (next: WeekPlan) => {
      setPlan(next)
      if (!uid) return
      saveWeekLocal(uid, next)

      if (!firebaseEnabled) return
      setSyncing(true)
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void saveWeek(uid, next).finally(() => setSyncing(false))
      }, 400)
    },
    [uid],
  )

  // 離開頁面前把還沒送出的雲端同步補掉
  useEffect(() => {
    return () => window.clearTimeout(saveTimer.current)
  }, [])

  const actions = {
    toggle: useCallback(
      (day: DayIndex, slot: SlotKey, groupId: string) => {
        if (plan) persist(toggleCheck(plan, day, slot, groupId))
      },
      [plan, persist],
    ),

    /** 整段一次打勾／取消 */
    toggleSlot: useCallback(
      (day: DayIndex, slot: SlotKey, done: boolean) => {
        if (plan) persist(setSlotChecked(plan, day, slot, done))
      },
      [plan, persist],
    ),

    swap: useCallback(
      (day: DayIndex, slot: SlotKey, from: string, to: string) => {
        if (plan) persist(swapGroup(plan, day, slot, from, to))
      },
      [plan, persist],
    ),

    add: useCallback(
      (day: DayIndex, slot: SlotKey, groupId: string) => {
        if (plan) persist(addToSlot(plan, day, slot, groupId))
      },
      [plan, persist],
    ),

    remove: useCallback(
      (day: DayIndex, slot: SlotKey, groupId: string) => {
        if (plan) persist(removeFromSlot(plan, day, slot, groupId))
      },
      [plan, persist],
    ),

    dismiss: useCallback(
      (groupId: string) => {
        if (plan) persist(dismissMakeup(plan, groupId))
      },
      [plan, persist],
    ),

    /** 編輯模板（永久改變每週長相） */
    updateTemplate: useCallback(
      (schedule: Schedule) => {
        setTemplate(schedule)
        if (uid) void saveTemplate(uid, schedule)
      },
      [uid],
    ),

    /** 把目前這週的排法存成模板 */
    saveCurrentAsTemplate: useCallback(() => {
      if (!plan || !uid) return
      setTemplate(plan.schedule)
      void saveTemplate(uid, plan.schedule)
    }, [plan, uid]),

    /** 用模板覆蓋本週（保留已打的勾） */
    resetWeekToTemplate: useCallback(() => {
      if (!plan) return
      persist({ ...plan, schedule: template, makeups: [], updatedAt: Date.now() })
    }, [plan, template, persist]),

    goPrevWeek: useCallback(() => setWeekOffset((o) => o - 1), []),
    goNextWeek: useCallback(() => setWeekOffset((o) => o + 1), []),
    goThisWeek: useCallback(() => setWeekOffset(0), []),
  }

  const todayIndex = ((new Date().getDay() + 6) % 7) as DayIndex
  const isCurrentWeek = weekKey === weekKeyOf(new Date())

  return {
    uid,
    isAnonymous,
    cloudReady,
    weekKey,
    weekOffset,
    plan,
    template,
    loading,
    syncing,
    todayIndex,
    isCurrentWeek,
    ...actions,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DayIndex, Schedule, SlotKey, WeekPlan } from '../domain/types'
import {
  addToSlot,
  dismissMakeup,
  dropToMakeup,
  moveGroup,
  removeFromSlot,
  setSlotChecked,
  shiftWeekKey,
  swapGroup,
  toggleCheck,
  weekKeyOf,
  type DragSource,
  type DropTarget,
} from '../domain/week'
import { defaultSchedule } from '../domain/catalog'
import {
  clearUser,
  firebaseEnabled,
  readSavedUser,
  saveUser,
  type UserId,
} from './firebase'
import {
  loadTemplate,
  loadWeek,
  saveTemplate,
  saveWeek,
  saveWeekLocal,
  watchCloud,
} from './store'

export interface WorkoutState {
  /** 目前選的使用者；null = 還沒選（顯示選人畫面） */
  readonly uid: UserId | null
  /** 真的讀寫過 Firestore 才是 true。設定填了但連不上時是 false。 */
  readonly cloudReady: boolean
  readonly weekOffset: number
  readonly weekKey: string
  readonly plan: WeekPlan | null
  readonly template: Schedule
  readonly loading: boolean
  readonly syncing: boolean
}

export function useWorkout() {
  // 上次選過的使用者直接進，不用再選一次
  const [uid, setUid] = useState<UserId | null>(readSavedUser)
  const [cloudReady, setCloudReady] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [plan, setPlan] = useState<WeekPlan | null>(null)
  const [template, setTemplate] = useState<Schedule>(defaultSchedule)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const weekKey = shiftWeekKey(new Date(), weekOffset)
  const saveTimer = useRef<number | undefined>(undefined)

  // 雲端狀態：由 store 真的讀寫成功／失敗回報，不是看設定有沒有填
  useEffect(() => watchCloud(setCloudReady), [])

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

    /**
     * 拖放：把一項搬到別格。回傳被頂出來的項目（黏在手上），沒有就是 null。
     * 呼叫端要拿這個回傳值決定手上還有沒有東西。
     */
    move: useCallback(
      (from: DragSource, to: DropTarget): string | null => {
        if (!plan) return null
        const r = moveGroup(plan, from, to)
        if (r.plan !== plan) persist(r.plan)
        return r.displaced
      },
      [plan, persist],
    ),

    /** 手上的項目放到空白處 → 進補做池 */
    dropAway: useCallback(
      (groupId: string, fromDay: DayIndex, fromSlot: SlotKey) => {
        if (plan) persist(dropToMakeup(plan, groupId, fromDay, fromSlot))
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

    /** 選使用者：記住，之後開啟就不用再選 */
    login: useCallback((user: UserId) => {
      saveUser(user)
      setUid(user)
      setPlan(null)
      setLoading(true)
    }, []),

    /** 換人：忘掉選擇，回到選人畫面（資料留在雲端與本機） */
    logout: useCallback(() => {
      clearUser()
      setUid(null)
      setPlan(null)
      setWeekOffset(0)
      setTemplate(defaultSchedule())
    }, []),

    goPrevWeek: useCallback(() => setWeekOffset((o) => o - 1), []),
    goNextWeek: useCallback(() => setWeekOffset((o) => o + 1), []),
    goThisWeek: useCallback(() => setWeekOffset(0), []),
  }

  const todayIndex = ((new Date().getDay() + 6) % 7) as DayIndex
  const isCurrentWeek = weekKey === weekKeyOf(new Date())

  return {
    uid,
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

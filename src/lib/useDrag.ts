import { useCallback, useEffect, useRef, useState } from 'react'
import type { DayIndex, SlotKey } from '../domain/types'

/** 手上拿著的那一顆 */
export interface Held {
  readonly groupId: string
  /** 它原本在哪（放到格線外時要從該格刪除） */
  readonly fromDay: DayIndex
  readonly fromSlot: SlotKey
  /** 目前手指位置（畫浮起的方塊用） */
  readonly x: number
  readonly y: number
  /** 拿起的那一刻手指在方塊內的偏移，讓方塊不會跳到手指左上角 */
  readonly dx: number
  readonly dy: number
  /** true = 這顆是被頂出來黏在手上的，不是使用者主動拿的 */
  readonly displaced: boolean
}

export interface DropZone {
  readonly day: DayIndex
  readonly slot: SlotKey
}

/** 按住多久才算「拿起來」——太短會跟「點一下打勾」打架 */
const HOLD_MS = 180
/** 按住期間手指移動超過這距離就當成捲動，不算拿起 */
const MOVE_TOLERANCE = 10
/** 手指進到底部中央這塊範圍，方塊就吸到垃圾桶。 */
const TRASH_WIDTH = 220
const TRASH_HEIGHT = 150

interface UseDragOptions {
  /** 放到某一格。回傳被頂出來的項目 id，沒有就 null */
  readonly onDropInto: (held: Held, zone: DropZone, displaceGroupId?: string) => string | null
  /** 放到 7 天 × 早晚格線外，直接丟棄 */
  readonly onDropAway: (held: Held) => void
}

/**
 * 手指拖放。用 pointer events 而不是 HTML5 drag-and-drop——
 * 後者在 iOS Safari 的觸控上根本不會觸發。
 */
export function useDrag({ onDropInto, onDropAway }: UseDragOptions) {
  const [held, setHeld] = useState<Held | null>(null)
  const [hoverZone, setHoverZone] = useState<DropZone | null>(null)
  const [trashActive, setTrashActive] = useState(false)

  const holdTimer = useRef<number | undefined>(undefined)
  const pending = useRef<{ x: number; y: number } | null>(null)
  /** iOS 的 pointercancel 常把座標清成 0；保留最後真的摸到的位置。 */
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const heldRef = useRef<Held | null>(null)
  heldRef.current = held

  const clearPending = useCallback(() => {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = undefined
    pending.current = null
  }, [])

  /** 找出手指底下是哪一格（拖曳中的浮動方塊要先設 pointer-events:none） */
  const zoneAt = useCallback((x: number, y: number): DropZone | null => {
    const el = document.elementFromPoint(x, y)
    const cell = el?.closest<HTMLElement>('[data-day][data-slot]')
    if (!cell) return null
    const day = Number(cell.dataset.day) as DayIndex
    const slot = cell.dataset.slot as SlotKey
    return { day, slot }
  }, [])

  /** 手指底下那顆方塊的 groupId（用來決定要頂掉誰） */
  const tileAt = useCallback((x: number, y: number): string | undefined => {
    const el = document.elementFromPoint(x, y)
    const tile = el?.closest<HTMLElement>('[data-group]')
    return tile?.dataset.group
  }, [])

  const isOverTrash = useCallback(
    (x: number, y: number): boolean =>
      y >= window.innerHeight - TRASH_HEIGHT &&
      Math.abs(x - window.innerWidth / 2) <= TRASH_WIDTH / 2,
    [],
  )

  const begin = useCallback(
    (e: React.PointerEvent, groupId: string, fromDay: DayIndex, fromSlot: SlotKey) => {
      // 已經有東西在手上時，這一下是「放下」不是「拿起」
      if (heldRef.current) return

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const startX = e.clientX
      const startY = e.clientY
      pending.current = { x: startX, y: startY }
      lastPoint.current = { x: startX, y: startY }

      /*
       * 從 pointerdown 當下就 capture。少這行時，手指滑出原方塊後，
       * iOS Safari 可能把後續事件交回瀏覽器，頁面永遠收不到 pointerup，
       * 畫面看起來就會是「拿得起來，但丟不掉」。
       */
      const target = e.currentTarget as HTMLElement
      try {
        target.setPointerCapture?.(e.pointerId)
      } catch {
        // 舊版 Safari 不支援時仍可走 window listener。
      }

      holdTimer.current = window.setTimeout(() => {
        if (!pending.current) return
        setHeld({
          groupId,
          fromDay,
          fromSlot,
          x: startX,
          y: startY,
          dx: startX - rect.left,
          dy: startY - rect.top,
          displaced: false,
        })
        // 拿起來時震一下，讓手指知道「起來了」
        navigator.vibrate?.(12)
        pending.current = null
      }, HOLD_MS)
    },
    [],
  )

  // 拖曳中：跟手指、算落點
  const dragging = held !== null

  useEffect(() => {
    if (!dragging) return

    function onMove(e: PointerEvent) {
      e.preventDefault()
      lastPoint.current = { x: e.clientX, y: e.clientY }
      setHeld((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
      const overTrash = isOverTrash(e.clientX, e.clientY)
      setTrashActive(overTrash)
      setHoverZone(overTrash ? null : zoneAt(e.clientX, e.clientY))
    }

    function finishAt(x: number, y: number) {
      const current = heldRef.current
      if (!current) return

      if (isOverTrash(x, y)) {
        onDropAway(current)
        setHeld(null)
        setHoverZone(null)
        setTrashActive(false)
        lastPoint.current = null
        navigator.vibrate?.([10, 35, 18])
        return
      }

      const zone = zoneAt(x, y)
      if (!zone) {
        // 不在星期一到日的早／晚格子裡 → 直接丟棄
        onDropAway(current)
        setHeld(null)
        setHoverZone(null)
        setTrashActive(false)
        lastPoint.current = null
        return
      }

      const displaceId = tileAt(x, y)
      const kicked = onDropInto(current, zone, displaceId)

      if (kicked) {
        // 被頂出來的黏到手上，繼續拖
        navigator.vibrate?.(8)
        setHeld({
          groupId: kicked,
          fromDay: zone.day,
          fromSlot: zone.slot,
          x,
          y,
          dx: current.dx,
          dy: current.dy,
          displaced: true,
        })
      } else {
        setHeld(null)
        lastPoint.current = null
      }
      setHoverZone(null)
      setTrashActive(false)
    }

    function onUp(e: PointerEvent) {
      finishAt(e.clientX, e.clientY)
    }

    function onCancel() {
      const point = lastPoint.current
      if (point) finishAt(point.x, point.y)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [dragging, zoneAt, tileAt, isOverTrash, onDropInto, onDropAway])

  /** 按住還沒到 HOLD_MS 就移動 → 當成捲動，取消拿起 */
  const maybeCancel = useCallback(
    (e: React.PointerEvent) => {
      const p = pending.current
      if (!p) return
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) clearPending()
    },
    [clearPending],
  )

  return { held, hoverZone, trashActive, begin, maybeCancel, endPending: clearPending }
}

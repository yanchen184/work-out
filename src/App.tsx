import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useWorkout } from './lib/useWorkout'
import { CATALOG, DAY_LABELS, groupById } from './domain/catalog'
import { formatWeekRange, overallProgress, weekProgress } from './domain/week'
import {
  checkKey,
  type DayIndex,
  type ExtraActivity,
  type MuscleGroup,
  type SlotKey,
} from './domain/types'
import { USERS } from './lib/firebase'
import { Tile } from './components/Tile'
import { TrainingIcon } from './components/TrainingIcon'
import { UiIcon } from './components/UiIcon'
import { useDrag, type DropZone, type Held } from './lib/useDrag'

const DAYS: readonly DayIndex[] = [0, 1, 2, 3, 4, 5, 6]
const SLOTS: readonly SlotKey[] = ['morning', 'evening']

/** 底部拉盤：兩顆按鈕各自對應一個 */
type Panel = 'progress' | 'template' | null

/** 挑項目的小視窗：往某格加東西 */
type Picker = { day: DayIndex; slot: SlotKey } | null

function extraAsGroup(activity: ExtraActivity): MuscleGroup {
  return {
    id: activity.id,
    name: activity.name,
    targetAmount: 0,
    unit: 'minutes',
    targetSessions: 1,
    tone: 'teal',
  }
}

export default function App() {
  const w = useWorkout()
  const [panel, setPanel] = useState<Panel>(null)
  const [picker, setPicker] = useState<Picker>(null)

  const { move, placeDetached, dropAway } = w

  const onDropInto = useCallback(
    (held: Held, zone: DropZone, displaceGroupId?: string): string | null => {
      const target = { day: zone.day, slot: zone.slot, displaceGroupId }
      return held.detached
        ? placeDetached(held.groupId, held.fromDay, held.fromSlot, target)
        : move(
            { day: held.fromDay, slot: held.fromSlot, groupId: held.groupId },
            target,
          )
    },
    [move, placeDetached],
  )

  const onDropAway = useCallback(
    (held: Held) => dropAway(held.groupId, held.fromDay, held.fromSlot),
    [dropAway],
  )

  const drag = useDrag({ onDropInto, onDropAway })

  // 還沒選過使用者 → 選一次，之後開啟就直接進來
  if (!w.uid) {
    return (
      <div className="app">
        <div className="pick">
          <h1 className="pick-title">每週健身</h1>
          <p className="pick-sub">選一個帳號，之後開啟就不用再選</p>
          <div className="pick-list">
            {USERS.map((u) => (
              <button key={u} className="pick-btn" onClick={() => w.login(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!w.plan) {
    return (
      <div className="app">
        <div className="loading">載入中…</div>
      </div>
    )
  }

  const plan = w.plan
  const customCatalog = (plan.extraActivities ?? []).map(extraAsGroup)
  const customById = new Map(customCatalog.map((group) => [group.id, group]))
  const resolveGroup = (id: string) => groupById(id) ?? customById.get(id)
  const overall = overallProgress(plan)
  const percent = overall.total === 0 ? 0 : Math.round((overall.done / overall.total) * 100)
  const held = drag.held

  return (
    <div className={`app${held ? ' is-dragging' : ''}`}>
      <header className="hd">
        <h1 className="hd-title">每週健身</h1>
        <div className="hd-right">
          {/* 只有真的讀寫過雲端才敢說同步；沒連上就誠實說存在本機 */}
          <span className="hd-sync" title={w.cloudReady ? '資料已同步雲端' : '資料存在這台裝置'}>
            {w.cloudReady ? (w.syncing ? '同步中' : '已同步雲端') : '存在這台裝置'}
          </span>
          <button className="icon-btn" onClick={w.logout} title="換人">
            {w.uid}
          </button>
        </div>
      </header>

      <nav className="weeknav">
        <button className="wk-arrow" onClick={w.goPrevWeek} aria-label="上一週">
          ‹
        </button>
        <button className="wk-label" onClick={w.goThisWeek}>
          <span className="wk-name">{w.isCurrentWeek ? '本週' : formatWeekRange(w.weekKey)}</span>
          <span className="wk-range">{formatWeekRange(w.weekKey)}</span>
        </button>
        <button className="wk-arrow" onClick={w.goNextWeek} aria-label="下一週">
          ›
        </button>
      </nav>

      <div className="bar">
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${percent}%` }}>
            <span className="bar-knob" />
          </div>
        </div>
        <span className="bar-pct">{percent}%</span>
      </div>

      <div className="grid">
        <div className="grid-head">
          <span className="gh-spacer" />
          <span className="gh-slot">早上</span>
          <span className="gh-slot">晚上</span>
        </div>

        {DAYS.map((day) => (
          <div
            key={day}
            className={`row${day === w.todayIndex && w.isCurrentWeek ? ' is-today' : ''}`}
          >
            <span className="row-day">{DAY_LABELS[day]}</span>
            {SLOTS.map((slot) => {
              const items = plan.schedule[day][slot]
              const isHover =
                drag.hoverZone?.day === day && drag.hoverZone?.slot === slot && Boolean(held)
              return (
                <div
                  key={slot}
                  className={`cell${isHover ? ' is-hover' : ''}`}
                  data-day={day}
                  data-slot={slot}
                >
                  {items.map((gid) => {
                    const group = resolveGroup(gid)
                    if (!group) return null
                    const done = plan.checked.includes(checkKey(day, slot, gid))
                    // 同一個部位可能出現在好幾天，凹槽只能留在「被拿走的那一格」
                    const ghost =
                      held?.groupId === gid &&
                      held.fromDay === day &&
                      held.fromSlot === slot &&
                      !held.detached &&
                      !held.displaced
                    return (
                      <div key={gid} className="cell-item" data-group={gid}>
                        <Tile
                          group={group}
                          done={done}
                          ghost={ghost}
                          onPointerDown={(e) => drag.begin(e, gid, day, slot)}
                          onPointerMove={drag.maybeCancel}
                          onPointerUp={drag.endPending}
                          onClick={() => {
                            if (!held) w.toggle(day, slot, gid)
                          }}
                        />
                      </div>
                    )
                  })}
                  {items.length < 2 && (
                    <button
                      className="cell-add"
                      onClick={() => setPicker({ day, slot })}
                      aria-label="加入訓練"
                    >
                      ＋
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {plan.makeups.filter((m) => !m.dismissed).length > 0 && (
        <section className="makeup">
          <h2 className="mk-title">本週補做</h2>
          <div className="mk-list">
            {plan.makeups
              .filter((m) => !m.dismissed)
              .map((m) => {
                const group = resolveGroup(m.groupId)
                if (!group) return null
                return (
                  <div
                    key={`${m.groupId}-${m.fromDay}-${m.fromSlot}`}
                    className="mk-item"
                    data-group={m.groupId}
                  >
                    <Tile
                      group={group}
                      done={false}
                      ghost={
                        held?.groupId === m.groupId &&
                        held.fromDay === m.fromDay &&
                        held.fromSlot === m.fromSlot &&
                        held.detached &&
                        !held.displaced
                      }
                      onPointerDown={(e) =>
                        drag.begin(e, m.groupId, m.fromDay, m.fromSlot, true)
                      }
                      onPointerMove={drag.maybeCancel}
                      onPointerUp={drag.endPending}
                    />
                    <button
                      className="mk-x"
                      onClick={() => w.dismiss(m.groupId, m.fromDay, m.fromSlot)}
                      aria-label={`不補做 ${group.name}`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
          </div>
        </section>
      )}

      <footer className="tabs">
        <button className="tab" onClick={() => setPanel('progress')}>
          <span className="tab-ico"><UiIcon name="progress" /></span>
          部位進度
        </button>
        <button className="tab" onClick={() => setPanel('template')}>
          <span className="tab-ico"><UiIcon name="template" /></span>
          每週模板
        </button>
      </footer>

      {/* 拿在手上、跟著手指跑的那一顆 */}
      {held &&
        (() => {
          const group = resolveGroup(held.groupId)
          if (!group) return null
          return (
            <Tile
              group={group}
              done={false}
              floating
              style={{
                left: held.x - held.dx,
                top: held.y - held.dy,
              }}
            />
          )
        })()}

      {picker && (
        <PickerSheet
          groups={[...CATALOG, ...customCatalog]}
          onClose={() => setPicker(null)}
          onPick={(gid) => {
            w.add(picker.day, picker.slot, gid)
            setPicker(null)
          }}
        />
      )}

      {panel === 'progress' && (
        <ProgressSheet
          rows={weekProgress(plan)}
          percent={percent}
          onAdd={w.addExtra}
          onRemove={w.removeExtra}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'template' && (
        <TemplateSheet
          onClose={() => setPanel(null)}
          onSaveCurrent={() => {
            w.saveCurrentAsTemplate()
            setPanel(null)
          }}
          onReset={() => {
            w.resetWeekToTemplate()
            setPanel(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * 底部拉盤外殼：點背景或往下拉都可以關，鍵盤按 Esc 也可以。
 *
 * 開啟時把焦點移進拉盤、Tab 在裡面繞（focus trap），關閉時還給原本那顆按鈕。
 * 少了這幾件事，鍵盤使用者會 tab 到蓋在底下、看不見也點不到的元素上。
 */
function Sheet({
  title,
  titleIcon,
  titleAside,
  onClose,
  children,
}: {
  title: string
  titleIcon?: React.ReactNode
  titleAside?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 記住開啟前焦點在哪，關閉時還回去
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // 焦點跑到拉盤外（例如被底下的畫面接走）就拉回來
      if (!ref.current?.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [onClose])

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <button className="sheet-grip" onClick={onClose} aria-label="關閉" />
        <div className="sheet-heading">
          <h2 className="sheet-title">
            {titleIcon && <span className="sheet-title-icon">{titleIcon}</span>}
            {title}
          </h2>
          {titleAside}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  )
}

function ProgressSheet({
  rows,
  percent,
  onAdd,
  onRemove,
  onClose,
}: {
  rows: ReturnType<typeof weekProgress>
  percent: number
  onAdd: (name: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    onAdd(name)
    setDraft('')
    setAdding(false)
  }

  return (
    <Sheet
      title="部位進度"
      titleIcon={<UiIcon name="progress" />}
      titleAside={
        <div className="prog-heading-actions">
          <span className="sheet-summary">
            本週總進度 <strong>{percent}%</strong>
          </span>
          <button
            className="prog-plus"
            onClick={() => setAdding((value) => !value)}
            aria-label="新增本週額外訓練"
            aria-expanded={adding}
          >
            ＋
          </button>
        </div>
      }
      onClose={onClose}
    >
      <div className="prog">
        {adding && (
          <form className="prog-add-form" onSubmit={submit}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={24}
              placeholder="例如：長跑"
              aria-label="額外訓練名稱"
              autoFocus
            />
            <button type="submit" disabled={!draft.trim()}>
              加入
            </button>
          </form>
        )}
        {rows.map((r) => (
          <div
            key={r.groupId}
            className={`prog-row${r.custom ? ' is-extra' : ''}`}
            style={{ '--row-tone': `var(--${r.tone})` } as React.CSSProperties}
          >
            <span className={`prog-icon${r.custom ? ' prog-extra-icon' : ''}`}>
              {r.custom ? '＋' : <TrainingIcon groupId={r.groupId} />}
            </span>
            <span className="prog-name">{r.name}</span>
            <div className="prog-track">
              <div
                className="prog-fill"
                style={{
                  width: r.target > 0 ? `${Math.min(100, (r.done / r.target) * 100)}%` : '0%',
                  background: `var(--${r.tone})`,
                }}
              />
            </div>
            <span className="prog-num">
              {r.done}/{r.target}
            </span>
            {r.custom && (
              <button
                className="prog-remove"
                onClick={() => {
                  if (window.confirm(`刪除「${r.name}」？本週課表上的同名方塊也會一起移除。`)) {
                    onRemove(r.groupId)
                  }
                }}
                aria-label={`刪除自訂訓練 ${r.name}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function TemplateSheet({
  onClose,
  onSaveCurrent,
  onReset,
}: {
  onClose: () => void
  onSaveCurrent: () => void
  onReset: () => void
}) {
  return (
    <Sheet title="每週模板" titleIcon={<UiIcon name="template" />} onClose={onClose}>
      <div className="sheet-note">
        <span className="sheet-note-icon"><UiIcon name="info" /></span>
        <p>模板是每一週的起點。單週拖來拖去不會動到模板；要永久改變就把目前這週存成模板。</p>
      </div>
      <div className="sheet-actions">
        <button className="sheet-btn is-primary" onClick={onSaveCurrent}>
          <span className="sheet-btn-icon"><UiIcon name="save" /></span>
          <span className="sheet-btn-copy">
            <strong>把這週存成模板</strong>
            <small>將目前的安排設為新的每週模板</small>
          </span>
          <span className="sheet-btn-fold" aria-hidden />
        </button>
        <button className="sheet-btn" onClick={onReset}>
          <span className="sheet-btn-icon"><UiIcon name="reset" /></span>
          <span className="sheet-btn-copy">
            <strong>用模板重設這週</strong>
            <small>放棄這週的排法，回到模板內容</small>
          </span>
          <span className="sheet-btn-fold" aria-hidden />
        </button>
      </div>
    </Sheet>
  )
}

function PickerSheet({
  groups,
  onClose,
  onPick,
}: {
  groups: readonly MuscleGroup[]
  onClose: () => void
  onPick: (groupId: string) => void
}) {
  return (
    <Sheet title="加入訓練" onClose={onClose}>
      <div className="pick-grid">
        {groups.map((g) => (
          <button
            key={g.id}
            className="pick-tile"
            style={{ '--tone': `var(--${g.tone})` } as React.CSSProperties}
            onClick={() => onPick(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

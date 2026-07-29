import { useState } from 'react'
import './App.css'
import { useWorkout } from './lib/useWorkout'
import { CATALOG, DAY_LABELS, groupById } from './domain/catalog'
import { formatWeekRange, overallProgress, weekProgress } from './domain/week'
import { checkKey, type DayIndex, type SlotKey } from './domain/types'
import { linkGoogle } from './lib/firebase'

const DAYS: readonly DayIndex[] = [0, 1, 2, 3, 4, 5, 6]
const SLOTS: readonly SlotKey[] = ['morning', 'evening']

function unitLabel(amount: number, unit: string): string {
  if (amount <= 0) return ''
  if (unit === 'sets') return `${amount}組`
  if (unit === 'minutes') return `${amount}分`
  return `${amount}時`
}

/** 開啟中的選單：替換某項目 or 新增到某格 */
type Sheet =
  | { kind: 'swap'; day: DayIndex; slot: SlotKey; groupId: string }
  | { kind: 'add'; day: DayIndex; slot: SlotKey }
  | null

export default function App() {
  const w = useWorkout()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [editingTemplate, setEditingTemplate] = useState(false)

  if (!w.plan) {
    return (
      <div className="app">
        <div className="loading">載入中…</div>
      </div>
    )
  }

  const plan = w.plan
  const schedule = editingTemplate ? w.template : plan.schedule
  const overall = overallProgress(plan)
  const progress = weekProgress(plan)
  const activeMakeups = plan.makeups.filter((m) => !m.dismissed)
  const pct = overall.total === 0 ? 0 : Math.round((overall.done / overall.total) * 100)

  /** 模板模式下改的是模板，本週模式下改的是這一週 */
  function mutate(
    day: DayIndex,
    slot: SlotKey,
    next: (current: readonly string[]) => readonly string[],
  ) {
    if (!editingTemplate) return
    const current = w.template[day][slot]
    w.updateTemplate({
      ...w.template,
      [day]: { ...w.template[day], [slot]: next(current) },
    })
  }

  function handleAdd(day: DayIndex, slot: SlotKey, groupId: string) {
    if (editingTemplate) {
      mutate(day, slot, (c) => (c.includes(groupId) ? c : [...c, groupId]))
    } else {
      w.add(day, slot, groupId)
    }
    setSheet(null)
  }

  function handleSwap(day: DayIndex, slot: SlotKey, from: string, to: string) {
    if (editingTemplate) {
      mutate(day, slot, (c) => (c.includes(to) ? c : c.map((g) => (g === from ? to : g))))
    } else {
      w.swap(day, slot, from, to)
    }
    setSheet(null)
  }

  function handleRemove(day: DayIndex, slot: SlotKey, groupId: string) {
    if (editingTemplate) {
      mutate(day, slot, (c) => c.filter((g) => g !== groupId))
    } else {
      w.remove(day, slot, groupId)
    }
    setSheet(null)
  }

  return (
    <div className="app">
      <header className="hd">
        <div>
          <h1 className="hd-title">每週健身</h1>
          <p className="hd-sub">
            {editingTemplate ? '編輯每週固定課表' : '點部位打勾 · ⋯ 可替換'}
            {w.syncing && ' · 儲存中'}
          </p>
        </div>
        <div className="hd-actions">
          <button
            className={`icon-btn${editingTemplate ? ' is-on' : ''}`}
            onClick={() => setEditingTemplate((v) => !v)}
            title={editingTemplate ? '回到本週' : '編輯模板'}
            aria-label={editingTemplate ? '回到本週' : '編輯模板'}
          >
            {editingTemplate ? '✓' : '⚙'}
          </button>
        </div>
      </header>

      {editingTemplate && (
        <div className="tpl-banner">
          <span>⚙</span>
          <span>模板模式：改動會套用到往後每一週</span>
          <button onClick={() => setEditingTemplate(false)}>完成</button>
        </div>
      )}

      {!editingTemplate && (
        <>
          <nav className="weeknav">
            <button className="icon-btn" onClick={w.goPrevWeek} aria-label="上一週">
              ‹
            </button>
            <div className="weeknav-label">
              {w.isCurrentWeek ? '本週' : w.weekKey}
              <span>{formatWeekRange(w.weekKey)}</span>
            </div>
            {!w.isCurrentWeek && (
              <button className="today-btn" onClick={w.goThisWeek}>
                回本週
              </button>
            )}
            <button className="icon-btn" onClick={w.goNextWeek} aria-label="下一週">
              ›
            </button>
          </nav>

          <section className="overall">
            <div className="overall-top">
              <span className="overall-label">本週完成度</span>
              <span className="overall-num">
                {pct}% <em>· {overall.done}/{overall.total} 格</em>
              </span>
            </div>
            <div className="track">
              <div className="track-fill" style={{ width: `${pct}%` }} />
            </div>
          </section>
        </>
      )}

      <div className="days">
        {DAYS.map((day) => {
          const isToday = !editingTemplate && w.isCurrentWeek && day === w.todayIndex
          const dayItems = SLOTS.flatMap((s) => schedule[day][s])
          const dayDone = SLOTS.flatMap((s) =>
            schedule[day][s].filter((g) => plan.checked.includes(checkKey(day, s, g))),
          )

          return (
            <article key={day} className={`day${isToday ? ' is-today' : ''}`}>
              <div className="day-hd">
                <span className="day-name">週{DAY_LABELS[day]}</span>
                {isToday && <span className="day-today-tag">今天</span>}
                {dayItems.length > 0 && !editingTemplate && (
                  <span className="day-count">
                    {dayDone.length}/{dayItems.length}
                  </span>
                )}
              </div>

              {SLOTS.map((slot) => {
                const items = schedule[day][slot]
                const allDone =
                  items.length > 0 &&
                  items.every((g) => plan.checked.includes(checkKey(day, slot, g)))

                return (
                  <div key={slot} className="slot">
                    <span className="slot-icon" aria-hidden>
                      {slot === 'morning' ? '☀' : '☾'}
                    </span>

                    <div className="slot-body">
                      {items.length === 0 && (
                        <span className="slot-empty">
                          {slot === 'morning' ? '早上休息' : '晚上休息'}
                        </span>
                      )}

                      {items.map((groupId) => {
                        const g = groupById(groupId)
                        if (!g) return null
                        const done =
                          !editingTemplate &&
                          plan.checked.includes(checkKey(day, slot, groupId))

                        return (
                          <span
                            key={groupId}
                            className={`pill${done ? ' is-done' : ''}`}
                            style={
                              {
                                '--tone': `var(--${g.tone})`,
                                '--tone-soft': `var(--${g.tone}-soft)`,
                              } as React.CSSProperties
                            }
                          >
                            <button
                              className="pill-name"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                              onClick={() =>
                                editingTemplate
                                  ? setSheet({ kind: 'swap', day, slot, groupId })
                                  : w.toggle(day, slot, groupId)
                              }
                              title={editingTemplate ? '點擊替換' : '點擊打勾'}
                            >
                              <span className="pill-dot" />
                              {g.name}
                              {g.targetAmount > 0 && (
                                <span className="pill-goal">
                                  {unitLabel(g.targetAmount, g.unit)}
                                </span>
                              )}
                            </button>
                            <button
                              className="pill-x"
                              onClick={() => setSheet({ kind: 'swap', day, slot, groupId })}
                              aria-label={`更換或移除${g.name}`}
                              title="更換／移除"
                            >
                              ⋯
                            </button>
                          </span>
                        )
                      })}

                      <button
                        className="pill-add"
                        onClick={() => setSheet({ kind: 'add', day, slot })}
                        aria-label={`在週${DAY_LABELS[day]}${slot === 'morning' ? '早上' : '晚上'}新增項目`}
                        title="新增項目"
                      >
                        ＋
                      </button>
                    </div>

                    {!editingTemplate && items.length > 0 && (
                      <button
                        className={`check${allDone ? ' is-on' : ''}`}
                        onClick={() => w.toggleSlot(day, slot, !allDone)}
                        aria-label={allDone ? '取消整段完成' : '整段標記完成'}
                        title={allDone ? '取消整段完成' : '整段標記完成'}
                      >
                        ✓
                      </button>
                    )}
                  </div>
                )
              })}
            </article>
          )
        })}
      </div>

      {!editingTemplate && activeMakeups.length > 0 && (
        <section className="makeup">
          <div className="makeup-hd">
            <span>⚠</span>
            <span>本週補做（被換掉還沒做的）</span>
          </div>
          <div className="makeup-list">
            {activeMakeups.map((m) => {
              const g = groupById(m.groupId)
              if (!g) return null
              return (
                <span key={`${m.groupId}-${m.fromDay}-${m.fromSlot}`} className="makeup-item">
                  <span style={{ color: `var(--${g.tone})` }}>{g.name}</span>
                  <span className="makeup-from">
                    原週{DAY_LABELS[m.fromDay]}
                    {m.fromSlot === 'morning' ? '早' : '晚'}
                  </span>
                  <button
                    className="makeup-skip"
                    onClick={() => w.dismiss(m.groupId)}
                    aria-label={`本週跳過${g.name}`}
                    title="本週跳過"
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        </section>
      )}

      {!editingTemplate && (
        <section className="prog">
          <div className="prog-hd">部位進度（時段數 / 週目標）</div>
          {progress.map((p) => {
            const ratio = p.target === 0 ? 0 : Math.min(p.done / p.target, 1)
            const short = p.planned < p.target
            return (
              <div key={p.groupId} className="prog-row">
                <div className="prog-name">
                  <span
                    className="pill-dot"
                    style={{ background: `var(--${p.tone})` }}
                    aria-hidden
                  />
                  <span>{p.name}</span>
                </div>
                <div className="prog-track">
                  <div
                    className="prog-fill"
                    style={
                      {
                        width: `${ratio * 100}%`,
                        '--tone': `var(--${p.tone})`,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <div className={`prog-num${short ? ' is-short' : ''}`}>
                  {p.done}/{p.target}
                  {short && <span className="prog-goal">·排{p.planned}</span>}
                </div>
              </div>
            )
          })}
        </section>
      )}

      <footer className="ft">
        {w.cloudReady && w.isAnonymous && (
          <button
            className="link-btn"
            onClick={() => {
              void linkGoogle().catch((e: unknown) => {
                console.warn('綁定失敗', e)
              })
            }}
          >
            綁定 Google 帳號（換手機資料跟著走）
          </button>
        )}
        <span>{w.cloudReady ? '資料已同步雲端' : '資料存在這台裝置'}</span>
      </footer>

      {sheet && (
        <div className="sheet-back" onClick={() => setSheet(null)} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />

            {sheet.kind === 'add' ? (
              <>
                <h2 className="sheet-title">
                  新增到 週{DAY_LABELS[sheet.day]}
                  {sheet.slot === 'morning' ? '早上' : '晚上'}
                </h2>
                <p className="sheet-sub">
                  {editingTemplate ? '會套用到往後每一週' : '只影響這一週'}
                </p>
              </>
            ) : (
              <>
                <h2 className="sheet-title">更換「{groupById(sheet.groupId)?.name}」</h2>
                <p className="sheet-sub">
                  {editingTemplate
                    ? '會套用到往後每一週'
                    : '只影響這一週，換掉的會進補做池'}
                </p>
              </>
            )}

            <div className="sheet-grid">
              {CATALOG.map((g) => {
                const already = schedule[sheet.day][sheet.slot].includes(g.id)
                const isSelf = sheet.kind === 'swap' && g.id === sheet.groupId
                return (
                  <button
                    key={g.id}
                    className="sheet-opt"
                    disabled={already && !isSelf}
                    style={
                      {
                        '--tone': `var(--${g.tone})`,
                        '--tone-soft': `var(--${g.tone}-soft)`,
                      } as React.CSSProperties
                    }
                    onClick={() =>
                      sheet.kind === 'add'
                        ? handleAdd(sheet.day, sheet.slot, g.id)
                        : handleSwap(sheet.day, sheet.slot, sheet.groupId, g.id)
                    }
                  >
                    <span className="pill-dot" />
                    <span>
                      {g.name}
                      <small>
                        {unitLabel(g.targetAmount, g.unit)}
                        {g.targetAmount > 0 ? ' · ' : ''}
                        {g.targetSessions}時段
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>

            {sheet.kind === 'swap' && (
              <>
                <div className="sheet-sep" />
                <button
                  className="sheet-danger"
                  onClick={() => handleRemove(sheet.day, sheet.slot, sheet.groupId)}
                >
                  從這一格移除
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

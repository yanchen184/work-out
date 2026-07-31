import type { CSSProperties } from 'react'
import type { MuscleGroup } from '../domain/types'
import { TrainingIcon } from './TrainingIcon'

function unitLabel(amount: number, unit: string): string {
  if (amount <= 0) return ''
  if (unit === 'sets') return `${amount}組`
  if (unit === 'minutes') return `${amount}分`
  return `${amount}時`
}

interface TileProps {
  readonly group: MuscleGroup
  readonly done: boolean
  /** 正在被拖曳中（原位要留下凹陷的空位） */
  readonly ghost?: boolean
  /** 浮在手上跟著手指跑的那一顆 */
  readonly floating?: boolean
  /** 已靠近底部垃圾桶，視覺上吸附進去 */
  readonly absorbed?: boolean
  readonly onPointerDown?: (e: React.PointerEvent) => void
  readonly onPointerMove?: (e: React.PointerEvent) => void
  readonly onPointerUp?: () => void
  readonly onClick?: () => void
  readonly style?: CSSProperties
}

/**
 * 一個帶專屬圖騰與切角層次的訓練方塊。
 * 打勾態＝實心飽和色 + ✓ 角標；未打勾＝淡色立體卡 + 彩色邊框。
 */
export function Tile({
  group,
  done,
  ghost,
  floating,
  absorbed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
  style,
}: TileProps) {
  const cls = [
    'tile',
    done ? 'is-done' : '',
    ghost ? 'is-ghost' : '',
    floating ? 'is-floating' : '',
    absorbed ? 'is-absorbed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      style={
        {
          '--tone': `var(--${group.tone})`,
          '--tone-soft': `var(--${group.tone}-soft)`,
          ...style,
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onKeyDown={
        floating || !onClick
          ? undefined
          : (e) => {
              // div 帶 role="button" 不會自己把 Enter/Space 轉成 click，
              // 少了這段就只能 tab 過去、按不下去——鍵盤根本打不了勾。
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault() // Space 預設會捲動頁面
              onClick()
            }
      }
      role={floating ? 'presentation' : 'button'}
      tabIndex={floating ? -1 : 0}
      aria-label={`${group.name}${done ? '（已完成）' : ''}`}
      title={floating ? undefined : done ? '點一下取消打勾' : '點一下打勾 · 按住可拖曳'}
    >
      <span className="tile-visual" aria-hidden>
        <TrainingIcon groupId={group.id} />
      </span>
      <span className="tile-copy">
        <span className="tile-name">{group.name}</span>
        {group.targetAmount > 0 && (
          <span className="tile-goal">{unitLabel(group.targetAmount, group.unit)}</span>
        )}
      </span>
      <span className="tile-fold" aria-hidden />
      {done && (
        <span className="tile-check" aria-hidden>
          ✓
        </span>
      )}
    </div>
  )
}

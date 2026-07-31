import abs from '../assets/training/abs.png'
import arms from '../assets/training/arms.png'
import back from '../assets/training/back.png'
import basketball from '../assets/training/basketball.png'
import cardioClass from '../assets/training/cardio-class.png'
import chest from '../assets/training/chest.png'
import cycling from '../assets/training/cycling.png'
import hiit from '../assets/training/hiit.png'
import legs from '../assets/training/legs.png'
import shoulders from '../assets/training/shoulders.png'
import squash from '../assets/training/squash.png'

const ICONS: Readonly<Record<string, string>> = {
  abs,
  arms,
  back,
  basketball,
  'cardio-class': cardioClass,
  chest,
  cycling,
  hiit,
  legs,
  shoulders,
  squash,
}

/**
 * 使用已確認概念稿的原始圖騰，不再以手刻 SVG 猜測造型。
 * 名稱仍是主要資訊，圖片只幫助快速辨識，因此不重複朗讀。
 */
export function TrainingIcon({ groupId }: { readonly groupId: string }) {
  // 自訂訓練沒有專屬產圖；先用跑者圖騰，仍以方塊上的使用者名稱為主資訊。
  const src = ICONS[groupId] ?? (groupId.startsWith('extra-') ? hiit : undefined)
  if (!src) return null

  return (
    <img
      className="training-icon"
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ pointerEvents: 'none' }}
      data-training-icon={groupId}
    />
  )
}

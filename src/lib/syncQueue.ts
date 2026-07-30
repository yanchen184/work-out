/**
 * 離線同步佇列。
 *
 * 為什麼需要：離線時 setDoc 會失敗，原本的做法是 catch 起來寫個 warning 就算了——
 * 那筆改動就再也不會上雲端，另一台裝置永遠讀不到。佇列把失敗的寫入留著，
 * 等網路回來（或離開頁面前）再送一次，「離線改完會同步到另一台」才算兌現。
 *
 * 佇列本身也要持久化：關掉分頁時記憶體就沒了，所以存在 localStorage。
 */

const QUEUE_KEY = 'workout:syncQueue'

export interface PendingWrite {
  readonly kind: 'week' | 'template'
  readonly uid: string
  /** kind === 'week' 才有 */
  readonly weekKey?: string
  readonly payload: unknown
}

/** 同一格只留最新一筆——舊的送上去也會被新的蓋掉，送它是浪費。 */
function slotKey(item: PendingWrite): string {
  return item.kind === 'week'
    ? `${item.uid}:week:${item.weekKey}`
    : `${item.uid}:template`
}

function read(): PendingWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingWrite[]) : []
  } catch {
    // 壞掉的佇列不值得讓整個 app 掛掉，當成空的就好
    return []
  }
}

function write(items: readonly PendingWrite[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch (error: unknown) {
    console.warn('同步佇列寫入本機失敗', error)
  }
}

export function enqueue(item: PendingWrite): void {
  const key = slotKey(item)
  const next = read().filter((existing) => slotKey(existing) !== key)
  write([...next, item])
}

/**
 * 送達確認後把該筆移出佇列。
 *
 * 只移除「同一格且 payload 相同」的那筆：送出期間使用者可能又改了一次，
 * 那筆較新的已經蓋在同一格上，不能被這次的成功回報連帶清掉。
 */
export function dequeue(item: PendingWrite): void {
  const key = slotKey(item)
  const stamp = JSON.stringify(item.payload)
  write(
    read().filter(
      (existing) =>
        slotKey(existing) !== key || JSON.stringify(existing.payload) !== stamp,
    ),
  )
}

export function peekQueue(): readonly PendingWrite[] {
  return read()
}

export function queueSize(): number {
  return read().length
}

export function clearQueue(): void {
  write([])
}

export interface FlushResult {
  readonly sent: number
  readonly failed: number
}

/** 同時只准跑一輪 flush，否則 online 事件跟離頁 flush 會把同一筆送兩次 */
let flushing: Promise<FlushResult> | null = null

/**
 * 把欠的寫入送出去。送成功的移出佇列，失敗的留著等下一輪。
 *
 * 注意：flush 期間可能有新的 enqueue 進來，所以最後是用「送成功的 key」
 * 去扣掉當下的佇列，不是直接覆寫成空陣列——否則會把新排進來的洗掉。
 */
export function flushQueue(
  send: (item: PendingWrite) => Promise<void>,
): Promise<FlushResult> {
  if (flushing) return flushing

  flushing = (async () => {
    const batch = read()
    if (batch.length === 0) return { sent: 0, failed: 0 }

    const done = new Set<string>()
    let failed = 0

    for (const item of batch) {
      try {
        await send(item)
        done.add(slotKey(item))
      } catch {
        // 還是送不出去，留在佇列裡等下一次
        failed += 1
      }
    }

    // 用當下的佇列扣掉已送出的，保住 flush 期間新排進來的那些
    write(read().filter((item) => !done.has(slotKey(item))))
    return { sent: done.size, failed }
  })()

  try {
    return flushing
  } finally {
    void flushing.finally(() => {
      flushing = null
    })
  }
}

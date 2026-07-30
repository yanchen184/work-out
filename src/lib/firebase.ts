import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** 沒設定 env 就整個關掉雲端，退回純本機模式 */
export const firebaseEnabled = Boolean(config.apiKey && config.projectId)

/**
 * Firestore 改成用到才載，不在開頁時就 import。
 *
 * 量過：Firebase 佔 466 KB（gzip 138 KB），是整包的 68%，但這個 app 的
 * source of truth 是 localStorage——雲端只是同步層，第一屏完全不需要它。
 * 原本 module 頂層就 `initializeApp`，等於把這 138 KB 綁進主 chunk 擋在
 * 首次繪製前面。改成動態 import 後，畫面先出來，同步在背景補上。
 *
 * 只 import 一次：promise 存起來重複用，避免併發呼叫各自初始化一份。
 */
let dbPromise: Promise<Firestore | undefined> | undefined

export function getDb(): Promise<Firestore | undefined> {
  if (!firebaseEnabled) return Promise.resolve(undefined)
  dbPromise ??= (async () => {
    try {
      const [{ initializeApp }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ])
      return getFirestore(initializeApp(config))
    } catch (error: unknown) {
      // 載不到就退回純本機模式，不能讓整個 app 開不起來
      console.warn('載入 Firestore 失敗，改用純本機模式', error)
      return undefined
    }
  })()
  return dbPromise
}

/**
 * 固定三個使用者，不做登入驗證——這是自用的打勾紀錄，
 * 選人只是決定資料存在雲端哪一格，不是安全邊界。
 */
export const USERS = ['bob', 'user1', 'user2'] as const
export type UserId = (typeof USERS)[number]

export function isUserId(value: string | null): value is UserId {
  return value !== null && (USERS as readonly string[]).includes(value)
}

const USER_KEY = 'workout:user'

/** 讀上次選的使用者；沒選過或值不合法就回 null（顯示選人畫面） */
export function readSavedUser(): UserId | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return isUserId(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveUser(user: UserId): void {
  try {
    localStorage.setItem(USER_KEY, user)
  } catch (error: unknown) {
    console.warn('記住使用者失敗', error)
  }
}

export function clearUser(): void {
  try {
    localStorage.removeItem(USER_KEY)
  } catch (error: unknown) {
    console.warn('清除使用者失敗', error)
  }
}

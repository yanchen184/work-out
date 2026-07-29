import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

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

let app: FirebaseApp | undefined
let dbInstance: Firestore | undefined

if (firebaseEnabled) {
  app = initializeApp(config)
  dbInstance = getFirestore(app)
}

export const db = dbInstance

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

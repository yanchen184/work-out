import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  getFirestore,
  type Firestore,
} from 'firebase/firestore'

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
let authInstance: Auth | undefined
let dbInstance: Firestore | undefined

if (firebaseEnabled) {
  app = initializeApp(config)
  authInstance = getAuth(app)
  dbInstance = getFirestore(app)
}

export const auth = authInstance
export const db = dbInstance

export interface AuthState {
  readonly user: User | null
  readonly isAnonymous: boolean
  readonly ready: boolean
}

/**
 * 監聽登入狀態；沒有 user 就自動匿名登入。
 * 回傳 unsubscribe。
 */
export function watchAuth(onChange: (state: AuthState) => void): () => void {
  if (!authInstance) {
    onChange({ user: null, isAnonymous: false, ready: true })
    return () => {}
  }

  return onAuthStateChanged(authInstance, (user) => {
    if (!user) {
      void signInAnonymously(authInstance!).catch((error: unknown) => {
        console.warn('匿名登入失敗，退回本機模式', error)
        onChange({ user: null, isAnonymous: false, ready: true })
      })
      return
    }
    onChange({ user, isAnonymous: user.isAnonymous, ready: true })
  })
}

/** 把匿名帳號升級綁定 Google（資料跟著走） */
export async function linkGoogle(): Promise<void> {
  if (!authInstance?.currentUser) throw new Error('尚未登入')
  const provider = new GoogleAuthProvider()
  try {
    await linkWithPopup(authInstance.currentUser, provider)
  } catch (error: unknown) {
    // 該 Google 帳號已存在 → 直接登入該帳號（放棄匿名資料）
    const code = (error as { code?: string }).code
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
      await signInWithPopup(authInstance, provider)
      return
    }
    throw error
  }
}

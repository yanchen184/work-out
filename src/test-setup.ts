import '@testing-library/jest-dom/vitest'

// 測試一律走本機模式：有 .env.local 時 vitest 也會讀到 Firebase 設定，
// 導致測試真的連線（登入失敗 / 權限被擋）並拖慢流程。測試要驗的是
// localStorage 這條路徑，雲端同步另外做 round-trip。
for (const key of Object.keys(import.meta.env)) {
  if (key.startsWith('VITE_FIREBASE_')) {
    import.meta.env[key] = ''
  }
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

/*
 * 加到主畫面後就是離線可用的 app。
 *
 * iOS PWA 實測曾卡在舊的 precache：線上已換新 JS，主畫面 app 重開仍載舊檔。
 * 所以啟動時主動 update；新 worker 接管後只 reload 一次，避免更新迴圈。
 */
let reloadingForUpdate = false
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })
}

let applyUpdate: (reloadPage?: boolean) => Promise<void> = async () => undefined
applyUpdate = registerSW({
  immediate: true,
  onRegisteredSW: (_swUrl, registration) => {
    void registration?.update()
  },
  onNeedRefresh: () => {
    void applyUpdate(true)
  },
  onNeedReload: () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // 掛在自訂網域 work.yanchen.app 的根目錄（public/CNAME）。
  // 不能用 /work-out/ 子路徑——設了自訂網域後 github.io/work-out/ 會轉址過來，
  // 兩邊都是從根目錄供應，base 帶子路徑會讓 JS/CSS 404。
  base: '/',
  plugins: [
    react(),
    // 加到 iPhone 主畫面就變獨立 app：自己的 icon、全螢幕沒網址列、離線也打得開。
    // 離線之所以夠用，是因為 localStorage 才是 source of truth，雲端只是同步層。
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '每週健身',
        short_name: '每週健身',
        description: '每週健身紀錄 — 部位打勾、時段替換、週目標追蹤',
        lang: 'zh-Hant',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7f5',
        theme_color: '#f7f7f5',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          // maskable：Android 自己切圓角時不會把主體裁掉
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 打包出來的 JS/CSS 都預快取，關掉網路仍能開 app
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Firestore 一律走網路，不快取（快取住反而讀到舊資料）
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
})

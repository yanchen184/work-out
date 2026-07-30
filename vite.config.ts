/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 掛在自訂網域 work.yanchen.app 的根目錄（public/CNAME）。
  // 不能用 /work-out/ 子路徑——設了自訂網域後 github.io/work-out/ 會轉址過來，
  // 兩邊都是從根目錄供應，base 帶子路徑會讓 JS/CSS 404。
  base: '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
})

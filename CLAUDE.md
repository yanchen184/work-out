# 每週健身 — 專案規則

## 狀態頁同步（硬約束）

本專案狀態頁：**https://html.yanchen.app/work-out/**

之後這個專案有**實質更新**（功能完成、驗收狀態變、進度推進、上線網址變動）→
回去更新那一頁，用 `/html-deploy` 推同一個 slug（`work-out`），不要另開新頁。

不是每次 commit 都推，是「對外狀態有變」才推。狀態頁至少要維持：
專案名 + 一句話定位、功能清單、驗收標準逐條 ✅/⚠️（沒真的驗過不准打 ✅）、
進度與線上網址、最後更新的絕對日期。

## 線上位置

- repo：https://github.com/yanchen184/work-out
- 線上版：https://work.yanchen.app/（push main 自動部署，`.github/workflows/deploy.yml`）
  - 自訂網域，Cloudflare CNAME `work` → `yanchen184.github.io`（unproxied，GitHub 要自己發 TLS 憑證，
    開 proxy 會讓憑證發不出來）。網域寫在 `public/CNAME`，**刪掉那個檔會讓自訂網域失效**。
  - 因此 `vite.config.ts` 的 `base` 必須是 `/`，不能是 `/work-out/`：設了自訂網域後
    `yanchen184.github.io/work-out/` 會 301 轉來這裡，兩邊都從根目錄供應，帶子路徑會讓 JS/CSS 404。
- Firebase 專案：`work-out-yc`

## 帳號模型（2026-07-29 定案，別再自作主張加回登入）

三個固定帳號 `bob` / `user1` / `user2`，**沒有密碼、沒有 Firebase Auth**。
選過就存 localStorage，之後直接進；頁尾一顆小小的登出可換人。
匿名登入與 Google 綁定已**刻意砍掉** — 尊上的原話是「不要這麼複雜 使用者基本上只要我一個」，
但「我會手機跟電腦同步的需求」，所以 Firestore 同步層保留、只砍掉多使用者那套機制。

安全性是**明知的取捨**：規則允許未登入讀寫這三格，換來開同一網址就同步。
`firestore.rules` 已把範圍鎖死在這三個 uid 的 `weeks/{weekKey}` 與 `meta/template`，
其他路徑一律拒。**不要「順手」把 Auth 加回來**，要加得先問。

## 手機安裝方式：PWA，不是原生 app（2026-07-30 定）

**沒有 Xcode 專案、沒有 Capacitor**。裝到 iPhone 的方式是：
Safari 開 https://work.yanchen.app/ → 分享 → **加入主畫面**。
之後從主畫面點開就是全螢幕、沒有網址列，離線也打得開。

- 離線之所以成立，是因為 `localStorage` 本來就是 source of truth，雲端只是同步層；
  Workbox 只負責把 JS/CSS/HTML 預快取起來，Firestore 一律走網路不快取（快取住會讀到舊資料）。
- 設定都在 `vite.config.ts` 的 `VitePWA({...})`；`registerSW({ immediate: true })` 在
  `src/main.tsx`；`virtual:pwa-register` 的型別要靠 `tsconfig.app.json` 的 `types`
  多列一項 `vite-plugin-pwa/client`（那個陣列是列舉式的，不加會 TS2307）。
- **iOS 只認 `<link rel="apple-touch-icon">`**，沒有的話它會拿網頁截圖當主畫面 icon。
  `index.html` 的那三個 meta/link 不要刪。
- icon 三個檔在 `public/`（`icon-192.png` / `icon-512.png` / `apple-touch-icon.png`），
  由 codex `image_gen` 生的，原始大圖**故意不進版控**（只會撐大 bundle）。
  要重生就重跑一次 codex 再 `sips -Z` 切三個尺寸。

## 目前未完成（更新狀態頁時記得對帳）

（無）跨裝置同步已於 2026-07-29 用兩個獨立瀏覽器 context 實測雙向通過。

## 這個專案的設計前提

- **只打勾，不記組數**。不要「順手」加組數/重量輸入。
- **課表可變**：預設模板只是起點；單週替換不動模板，模板編輯才永久生效。
  預設模板是**一天一早一晚**（2026-07-30 定，`src/domain/catalog.ts` 的 `defaultSchedule()`）：
  一 二三頭/胸肩、二 間歇/背、三 腹肌/有氧課程、四 二三頭/籃球、五 間歇/胸肩、六 腹肌/背、日 休。
  改這個函式會讓 `week.test.ts` / `App.test.tsx` 的 fixture 坐標全部失準——
  那是 fixture 過期不是行為回歸，**改坐標、不准放寬斷言**。
- **補做池只收「沒打勾」的**：已打勾的被換掉不算欠。
- **離線優先**：`localStorage` 是本機的 source of truth，Firebase 只是同步層；
  本機寫入**不准 debounce**（切週/關頁面會掉資料，已踩過一次），只 debounce 雲端。
- `domain/` 全部純函式、回傳新物件，不改參數。

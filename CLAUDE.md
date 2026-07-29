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
- 線上版：https://yanchen184.github.io/work-out/（push main 自動部署，`.github/workflows/deploy.yml`）
- Firebase 專案：`work-out-yc`

## 目前未完成（更新狀態頁時記得對帳）

- **匿名登入未啟用**：Firestore 與安全規則已部署且實測擋得住未授權寫入，
  但 Authentication 還沒初始化 — 新專案要在 Firebase Console 的 Authentication
  頁點一次「開始使用」再啟用「匿名」，CLI 與 API 都做不到（API 會被導向要收費的
  Identity Platform）。**在真的跨裝置同步驗過之前，狀態頁的雲端同步維持 ⚠️，不准改 ✅。**

## 這個專案的設計前提

- **只打勾，不記組數**。不要「順手」加組數/重量輸入。
- **課表可變**：預設早上課表只是起點；單週替換不動模板，模板編輯才永久生效。
- **補做池只收「沒打勾」的**：已打勾的被換掉不算欠。
- **離線優先**：`localStorage` 是本機的 source of truth，Firebase 只是同步層；
  本機寫入**不准 debounce**（切週/關頁面會掉資料，已踩過一次），只 debounce 雲端。
- `domain/` 全部純函式、回傳新物件，不改參數。

# 交接文件 — 方塊視覺改版（已完成）

> 2026-07-31 建。給接手的人（Codex）看的。
> 專案根目錄：`/Users/yanchen/workspace/ios-app/work-out`
>
> **完成註記（2026-07-31）**：採用「專屬線性圖騰 + 漸層質感 + 切角層次」，
> 11 種訓練、部位進度拉盤、每週模板拉盤與底部入口已統一改版。

---

## 一、要做的事（唯一任務）

**把訓練方塊的視覺改掉。尊上的原話是「我不想要這麼單調的正方形」。**

現在每個訓練項目就是一個**素色圓角方塊**：淡色底 + 同色細邊框 + 中文名 + 份量小字，
右上角一顆小圓點（未完成）或白圈打勾（已完成）。七天 × 早晚一共十四格排下來，
整片看過去就是一堆一模一樣的方形色塊，沒有層次、沒有記憶點。

**要的結果**：方塊不再是單調的素色正方形，要有設計感與質感，但
**一屏仍要看得完整週、資訊仍要清楚可讀**。

### 已知的三個可行方向（尊上尚未選定，可自行判斷或提案）

1. **漸層 + 質感**：斜向漸層底、細微高光與內陰影、柔和投影；已完成態有明顯「按下去」的實心感。
   改動最小，純 CSS，不動結構與資料。
2. **每個部位配一個圖示**：胸／肩／背／腿／二三頭／腹肌／間歇／有氧課程／籃球／壁球／腳踏車
   各配一個線性圖示，方塊變成「圖示 + 名稱 + 份量」。一眼認得出來，不用讀字。
   需要新增圖示資源（inline SVG 最省事，不要外部圖檔）。
3. **跳脫方格**：膠囊／圓形徽章／斜切卡片等非矩形造型 + 鮮明色系與光暈。
   視覺變化最大，但要小心一屏塞不下與可讀性。

三選一或混搭都可以。**交付前要開瀏覽器看真實渲染**（見第四節）。

---

## 二、現況：改動點在哪

| 檔案 | 位置 | 內容 |
|---|---|---|
| `/Users/yanchen/workspace/ios-app/work-out/src/components/Tile.tsx` | 全檔 | 方塊元件。`unitLabel()` 產生「15組／20分／3時」；`cls` 組出 `tile` / `is-done` / `is-ghost` / `is-floating` 四種狀態；把 `--tone` / `--tone-soft` 兩個 CSS 變數綁到 group 的色票上 |
| `/Users/yanchen/workspace/ios-app/work-out/src/App.css` | 275–380 行 | 方塊全部的樣式。`.tile` 基礎態、`.tile::after` 未完成的小圓點、`.tile.is-done` 打勾態（漸層實心）、`.tile-check` 白圈勾、`.tile.is-ghost` 拖走後的凹槽、`.tile.is-floating` 跟著手指跑的那顆 |
| `/Users/yanchen/workspace/ios-app/work-out/src/index.css` | `:root` 色票 | 七個色票 `--indigo / --coral / --amber / --teal / --violet / --lime / --sky`，每個都有 `-soft` 版本。依 2026-07-31 最終確認固定使用淺色模式 |
| `/Users/yanchen/workspace/ios-app/work-out/src/domain/catalog.ts` | 6–21 行 | 十一個部位與各自的 `tone`。**要加圖示的話，欄位加在這裡** |

### 十一個部位（`catalog.ts` 的真實內容，不要自己編）

| id | 名稱 | 週目標 | 時段數 | tone |
|---|---|---|---|---|
| `chest` | 胸 | 15 組 | 2 | indigo |
| `shoulders` | 肩 | 15 組 | 2 | sky |
| `back` | 背 | 15 組 | 2 | violet |
| `legs` | 腿 | — | 2 | teal |
| `arms` | 二三頭 | 20 分 | 2 | coral |
| `abs` | 腹肌 | 30 分 | 2 | amber |
| `hiit` | 間歇 | 20 分 | 2 | coral |
| `cardio-class` | 有氧課程 | 1 時 | 1 | lime |
| `basketball` | 籃球 | 3 時 | 1 | amber |
| `squash` | 壁球 | 2 時 | 1 | teal |
| `cycling` | 腳踏車 | 2 時 | 1 | lime |

### 預設課表（`defaultSchedule()`，一天早／晚各一攤）

一 二三頭／胸·肩　二 間歇／背　三 腹肌／有氧課程
四 二三頭／籃球　五 間歇／胸·肩　六 腹肌／背　日 休

---

## 三、絕對不能碰的東西（踩到會壞）

1. **`defaultSchedule()` 不要改。** 改了會讓 `src/domain/week.test.ts` 與 `src/App.test.tsx`
   的 fixture 座標全部失準。若真的非改不可，**要去改測試的座標，不准放寬斷言**。
2. **不要加組數／重量輸入。** 這個 App 的設計前提是「只打勾，不記組數」。
3. **不要把登入／Firebase Auth 加回來。** 三個固定帳號 `bob` / `user1` / `user2`、無密碼，
   是刻意的取捨。要加得先問尊上。
4. **本機寫入不准 debounce。** `localStorage` 是 source of truth，只有雲端同步可以 debounce。
   （切週或關頁面會讓還沒到期的 timer 失效，資料就掉了，已踩過一次。）
5. **`domain/` 全部是純函式**，回傳新物件、不改參數。這次改視覺原則上不該動到 `domain/`
   （除非是在 `catalog.ts` 加圖示欄位）。
6. **`public/CNAME` 不能刪**，刪了自訂網域 `work.yanchen.app` 會失效。
7. **`vite.config.ts` 的 `base` 必須維持 `/`**，不能改成 `/work-out/`。

---

## 四、驗收標準（沒做到不算完成）

1. **`npm test` 全綠**（目前 138 個測試，5 個檔）。
2. **`npm run build` 成功**。
3. **開瀏覽器看真實渲染並截圖**——這條最重要。型別過、build 綠、邏輯對**都不算**視覺正確。
   `overflow:hidden` 造成的截斷、flex 擠壓、換行爆版都不會報錯，只有眼睛抓得到。
   - 至少要看：固定**淺色模式**、**手機寬度（375px）與窄螢幕（320px）**。
   - 要確認：十四格一屏看得完、長名稱（「有氧課程」「腳踏車」）不爆版不截斷、
     已完成與未完成一眼分得出來、拖曳中那顆（`.is-floating`）仍然正常。
4. **拖曳仍然能用**。長按 0.18 秒拿起來、放到別格換位置、放到空白處進補做池。
   走的是 pointer events（不是 HTML5 drag-and-drop，那個在觸控上不會觸發）。

跑起來：

```bash
cd /Users/yanchen/workspace/ios-app/work-out
nvm use          # Node 22.12.0，版本寫在 .nvmrc
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

---

## 五、已經做完的事（不用重做）

- **App icon 已全部換新**（深藍底、橘紅日曆帶閃電、綠勾）。
  `public/icon-192.png`、`public/icon-512.png`、`public/apple-touch-icon.png`
  三個檔加上 `index.html` 內嵌的 32px base64 都換過了，已 round-trip 驗過
  （headless 瀏覽器實際 fetch、開圖確認）。commit `c2870c0`，已推上 main。
- **README 頂部加了一張 hero 圖**：`docs/images/readme-hero.jpg`（同一個 commit）。
- `.gitignore` 已加 `.plan-assets/`（codex 產圖的原始大圖不進版控）。

---

## 六、完成狀態

1. ~~**方塊視覺改版**~~ — 已於 2026-07-31 完成。
2. ~~**更新專案狀態頁**~~ — 已於 2026-07-31 覆蓋部署同一個 `work-out` slug，
   並以 HTTP 200 與 `/api/sites` metadata 完成 round-trip 驗證。

---

## 七、待處理的雜項（順手可清）

- `docs/images/design-main.png`（1.5 MB）與 `docs/images/design-drag.png`（1.2 MB）
  是舊的設計稿，**已進版控但沒有任何地方引用**。共 2.7 MB。留或刪請問尊上。
- 我測試時在 production 的 `user2` 帳號、`2026-W31` 這週留下了 **2 個勾**。
  因為 `mergeWeekPlans` 的 `checked` 取聯集，取消打勾會被另一份舊資料復活，
  所以**我無法用正常操作清掉**。要清只能刪 Firestore 文件，那是不可逆操作，
  我沒有動、也不建議接手的人自行動——**要清請先問尊上**。

---

## 八、線上與部署

- repo：https://github.com/yanchen184/work-out
- 線上版：https://work.yanchen.app/（push main 自動部署，`.github/workflows/deploy.yml`）
- Firebase 專案：`work-out-yc`
- 狀態頁：https://html.yanchen.app/work-out/

一般 `commit` + `push` 寫完驗過直接做，不用問。
`force push`、改已推出去的歷史、刪 branch、跨環境同步則要先問尊上。

import { readFileSync, writeFileSync } from 'node:fs'

/**
 * 產生 html.yanchen.app/work-out/ 的狀態頁（單一自包含 HTML，圖片全部 inline）。
 *
 *   node scripts/gen-status.mjs   → 寫出 docs/status.html
 *
 * 之後用 /html-deploy 把 docs/status.html 推到同一個 slug（work-out）。
 * 截圖要換新的話：跑瀏覽器拍 390×844 固定淺色，用
 *   sips -s format jpeg -s formatOptions 72 -Z 780 in.png --out docs/images/status-xxx.jpg
 * 蓋掉對應檔案再重跑這支。
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const b64 = (p) => readFileSync(p).toString('base64')
const img = (p) => `data:image/png;base64,${b64(p)}`

// favicon 直接用 app 自己的 icon，狀態頁跟 app 分頁看起來是同一件事
const favicon = img(`${REPO}/public/icon-192.png`)

const css = readFileSync(`${REPO}/scripts/status.css`, 'utf8')

// 截圖走 JPEG：四張 PNG 內嵌會讓單檔破 600KB，JPEG 品質 72 看不出差別但只剩四成
const jpg = (p) => `data:image/jpeg;base64,${b64(p)}`

const shots = [
  ['status-main.jpg', '主畫面：一週七天 × 早上／晚上，整週一屏看完'],
  ['status-drag.jpg', '拿起來放下去：來源變灰、目標格發光、往下拖到垃圾桶放手丟棄'],
  ['status-progress.jpg', '底部拉盤 ①：部位進度（本週各部位完成度）'],
  ['status-template.jpg', '底部拉盤 ②：每週模板（存成模板／用模板重設）'],
]

const rows = [
  ['ok', '手機版版面', '一週七天 × 早/晚兩欄，整週一屏看完，不用捲',
   '線上實測 390×844：22/22 視覺驗收項全過，截圖肉眼確認七列全在一屏內'],
  ['ok', '11 種專屬訓練圖騰', '每個部位／活動有自己的線性圖騰、漸層質感與切角層次',
   '2026-07-31 真實瀏覽器逐一確認；間歇使用衝刺跑者、二三頭使用屈臂肌肉，依最終決定固定淺色，375px/320px 皆不截字'],
  ['ok', '訓練方塊可拿起放下', '長按拿起、拖到別格放下，有浮起與落點提示',
   '線上實測：週一早「二三頭」拖到週日晚成功，來源清空、目標出現；截圖拍到拖曳中狀態'],
  ['ok', '被頂掉的黏到手上', '放進已有項目的格子，原本那顆會被頂出來繼續拿在手上',
   '瀏覽器實測：連續替換不需重新拿起，displaced 狀態接手'],
  ['ok', '底部垃圾桶吸附移到補做', '拿起後底部出現垃圾桶；往下靠近時方塊吸附，放手從原格移除並進本週補做',
   '垃圾桶與其他格線外落點共用同一資料邏輯，只有呈現不同；元件測試涵蓋兩條路徑'],
  ['ok', '兩顆底部按鈕', '部位進度、每週模板各自從底部彈上來',
   '2026-07-31 真實瀏覽器：兩個拉盤皆正常開闔；進度列圖騰與模板操作卡截圖確認，320px 無橫向溢出'],
  ['ok', '預設模板一早一晚', '一 二三頭/胸肩、二 間歇/背、三 腹肌/有氧課程、四 二三頭/籃球、五 間歇/胸肩、六 腹肌/背、日 休',
   '線上截圖逐格核對七天皆符；69 個單元＋元件測試全過'],
  ['ok', '加到 iPhone 主畫面', 'Safari → 分享 → 加入主畫面，開啟後全螢幕、無網址列',
   'manifest 線上實測：display=standalone、start_url=/、有 192/512 icon'],
  ['ok', 'iOS 主畫面 icon 正確', '不是網頁截圖，是自己畫的 icon',
   '線上實測 apple-touch-icon 回 200 且真的是 180×180 PNG'],
  ['ok', 'service worker 與預快取', '資產預快取，離線可開',
   '線上實測：SW 註冊成功、scope=/，預快取檔數 ≥ 5'],
  ['ok', '斷網仍可開啟使用', '關掉網路重開 app 照樣進得去、還能打勾、打的勾留得住',
   '線上實測（setOffline）：重開畫面正常 → 離線打勾 0% → 7% → 再重開仍為 7%'],
  ['ok', '打勾記錄', '點部位即標記完成，狀態持久化',
   '瀏覽器實測：完成度百分比隨打勾變動，reload 後保留'],
  ['ok', '單週替換不動模板', '換掉的只影響這一週',
   '瀏覽器實測 + 元件測試：切到下一週回到模板內容'],
  ['ok', '模板永久編輯', '「把這週存成模板」套用到往後每一週',
   '元件測試：改模板後切下一週，新項目出現'],
  ['ok', '週切換與重整不掉資料', '每週各自獨立，切走切回、關掉重開都在',
   '瀏覽器實測：切上週歸零、切回維持；reload 前後一致'],
  ['ok', '三個固定帳號', 'bob / user1 / user2，選過就記住，可登出換人',
   '瀏覽器實測：選完直接進、重開不再問、登出回選人畫面'],
  ['ok', '帳號資料隔離', 'user2 的改動不會污染 bob',
   '瀏覽器實測：另開新裝置以 bob 進入，狀態未變'],
  ['ok', 'Firestore 安全規則', '只允許三個 uid 的 weeks/meta 兩種路徑，其餘全拒',
   'REST 實測 4 條：users/hacker 與 users/bob/junk 皆 PERMISSION_DENIED'],
  ['ok', 'Realtime 雲端同步', '同帳號的兩個分頁／手機與電腦，不刷新也會立即看到打勾',
   '2026-07-31 補上 Firestore onSnapshot；測試鎖住即時推送、讀取競態，以及取消勾選不被舊資料復活'],
  ['ok', '線上部署（自訂網域）', 'work.yanchen.app，push main 自動更新',
   'CI 綠 + 線上實測：https 200、舊網址 github.io/work-out/ 301 轉來'],
]

const rowHtml = rows
  .map(
    ([cls, title, spec, ev]) => `    <tr class="${cls}">
      <td class="st">${cls === 'ok' ? '✅' : '⚠️'}</td>
      <td><strong>${title}</strong><span class="spec">${spec}</span></td>
      <td class="ev">${ev}</td>
    </tr>`,
  )
  .join('\n')

const shotHtml = shots
  .map(
    ([f, cap]) =>
      `    <div class="shot"><img src="${jpg(`${REPO}/docs/images/${f}`)}" alt="${cap}"><span>${cap}</span></div>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/png" sizes="192x192" href="${favicon}">
<title>每週健身 — 專案狀態</title>
<style>${css}
/* 四張手機直式截圖：寬螢幕排 2×2，不要 3+1 落單；窄螢幕自動掉成一欄 */
.shots{grid-template-columns:repeat(2,1fr)}
.shot img{max-height:560px;width:auto;margin:0 auto}
@media(max-width:560px){.shots{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <h1>每週健身</h1>
  <p class="lede">每週健身打勾紀錄 — 七天 × 早/晚，方塊拿起來就能換位置；可加到 iPhone 主畫面當 app 用</p>
  <p class="meta">
    <span class="badge">React 19 + TS + Vite</span>
    <span class="badge">PWA</span>
    <span class="badge">Firestore 同步</span>
    <span class="badge ok">已上線</span>
    <br>最後更新：2026-07-31
  </p>

  <div class="card">
    <div class="stat">
      <div><b>${rows.length}/${rows.length}</b><span>驗收條件通過</span></div>
      <div><b>143</b><span>單元 + 元件測試</span></div>
      <div><b>51</b><span>瀏覽器實測項（版面 22 + PWA 本機 14 + PWA 線上 15）</span></div>
      <div><b>11</b><span>訓練部位配額</span></div>
    </div>
  </div>

  <div class="card" style="margin-top:14px">
    <strong>線上版：</strong><a href="https://work.yanchen.app/">work.yanchen.app</a>
    &nbsp;·&nbsp; <strong>repo：</strong><a href="https://github.com/yanchen184/work-out">yanchen184/work-out</a>
  </div>

  <div class="note" style="margin-top:14px">
    <strong>裝到手機：</strong>用 Safari 開 <a href="https://work.yanchen.app/">work.yanchen.app</a> →
    分享 → <strong>加入主畫面</strong>。之後從主畫面點開就是全螢幕、沒有網址列，斷網也打得開。
    沒有上架 App Store，也沒有 Xcode 專案 —— 這是 PWA。
  </div>

  <h2>畫面</h2>
  <div class="shots">
${shotHtml}
  </div>

  <h2>驗收契約</h2>
  <div class="card"><table>
${rowHtml}
  </table></div>
  <div class="note">
    <strong>安全性取捨（刻意的）：</strong>只有三個固定帳號 <code>bob</code> /
    <code>user1</code> / <code>user2</code>，<strong>沒有密碼、沒有 Firebase Auth</strong>。
    帳號只決定資料存雲端哪一格，不是安全邊界 —— 換來的是「手機電腦開同一網址就同步」，
    代價是知道專案 ID 的人也能讀寫這三格。安全規則因此把範圍鎖死在這三個 uid 的
    <code>weeks/{weekKey}</code> 與 <code>meta/template</code>，其他路徑一律拒絕
    （已用 REST 實測）。存的是健身打勾紀錄、沒有個資，故接受此取捨；
    要真正的存取控制就得加回 Google 登入。
  </div>

  <h2>設計決策</h2>
  <div class="card">
    <ul>
      <li><strong>手機優先，一屏看完整週</strong> — 七天 × 早/晚做成兩欄格線，不是往下捲的長列表。</li>
      <li><strong>圖騰 + 文字雙重辨識</strong> — 11 種訓練各有專屬圖騰圖片，搭配原本的名稱與份量；
        不靠顏色單獨傳達資訊。跑步間歇是衝刺跑者，二三頭是屈臂肌肉。</li>
      <li><strong>拿起來放下去，而不是選單選</strong> — 長按 180ms 才算拿起（太短會跟「點一下打勾」打架），
        期間手指移動超過 10px 就當成捲動。用 pointer events 不用 HTML5 drag-and-drop，
        後者在 iOS Safari 觸控上根本不會觸發。</li>
      <li><strong>被頂掉的黏在手上</strong> — 放進已有項目的格子，原本那顆接著被拿在手上，
        可以直接放到別格，或往下拖進垃圾桶丟棄，不用重新拿一次。</li>
      <li><strong>手機式垃圾桶刪除</strong> — 拿起方塊時底部浮出垃圾桶，靠近後方塊會縮小吸附，
        垃圾桶開蓋並震動提示；放手後原格消失並進補做。它和其他格線外放手的功能相同，
        只差吸附呈現。iOS 從按下就 capture pointer，
        避免 Safari 接管手勢造成「拿得起來但丟不掉」。</li>
      <li><strong>預設模板一天一早一晚</strong> — 早上與晚上各一攤，不是全擠在早上。模板只是起點，隨時可改。</li>
      <li><strong>只打勾不記組數</strong> — 在健身房不想輸入數字；組數目標放在部位進度當參考。</li>
      <li><strong>補做池只收「沒打勾」的</strong> — 已經做過的換掉不算欠，避免假提醒。</li>
      <li><strong>PWA 而不是原生 app</strong> — 需求是「放到手機裡面」，PWA 一次搞定 iPhone 與電腦、
        不用 Xcode、不用上架、改完 push 就更新。離線之所以成立，是因為
        <code>localStorage</code> 本來就是 source of truth，雲端只是同步層。</li>
      <li><strong>三個帳號取代登入系統</strong> — 使用者實際上只有一個人，但有手機↔電腦同步的需求。
        保留 Firestore 當同步層，砍掉整套 Auth。複雜度砍一層，代價是安全性（見上方取捨說明）。</li>
    </ul>
  </div>

  <h2>過程中修掉的 bug</h2>
  <div class="card">
    <ul>
      <li><strong>整段打勾只生效最後一項</strong> — 迴圈連續呼叫 <code>toggle</code> 都讀到同一份
        stale 的 plan，前面的更新被蓋掉。改成單次不可變更新。<em>由元件測試抓到。</em></li>
      <li><strong>切週會掉資料</strong> — 本機儲存被 400ms debounce 包住，timer 到期前切週或
        關頁面就整筆遺失。改成本機立即寫入，只 debounce 雲端同步。
        <em>由 jsdom 與真實瀏覽器的時序差異暴露出來。</em></li>
      <li><strong>測試會連上真的 Firebase</strong> — <code>.env.local</code> 的
        <code>VITE_FIREBASE_*</code> 連 vitest 也讀得到，測試跑去打真的 Firestore。
        改成 test-setup 清空這些變數。<em>測試時間也從 5.1s 降到 1.6s。</em></li>
      <li><strong>頁尾謊稱「資料已同步雲端」</strong> — 文案看的是「設定有沒有填」不是「雲端有沒有真的通」。
        改成只認「真的成功讀或寫過一次 Firestore」。<em>同一個病根：拿 handshake 當結果。</em></li>
      <li><strong>同步驗證腳本自己會過假</strong> — 兩項「同步成功」是 <code>false === false</code> 過的，
        選擇器抓錯層級導致點擊沒生效，兩台裝置都「沒打勾」所以比對成功。
        <em>驗證腳本本身也要有「這次真的改變了嗎」的前提斷言。</em></li>
      <li><strong>驗證腳本用 <code>--mode</code> 隔離不了憑證</strong> — <code>.env.local</code>
        在<em>每個</em> mode 都會載入，本想跑「無 Firebase」的驗證其實連上了真的雲端。
        改成 build 指令上直接把 <code>VITE_FIREBASE_*</code> 清空，並用
        <code>grep</code> 確認打包產物裡真的沒有專案 ID。</li>
    </ul>
  </div>

  <h2>下一步</h2>
  <div class="card">
    <ul>
      <li>目前沒有待辦。原需求的「iOS app」已用 PWA 加到主畫面滿足；
        若之後真的要上 App Store 才需要開 Xcode 專案。</li>
    </ul>
  </div>
</div>
</body>
</html>
`

writeFileSync(`${REPO}/docs/status.html`, html)
console.log(`寫出 ${(html.length / 1024).toFixed(0)}KB`)

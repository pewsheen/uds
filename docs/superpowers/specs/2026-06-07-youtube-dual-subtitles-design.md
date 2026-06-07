# YouTube 雙字幕 Chrome 擴充功能 — 設計 Spec

> 日期:2026-06-07
> 狀態:設計定稿,待 writing-plans

---

## 0. 兩個目標 (Two goals)

這份 spec 同時設計兩件事:

1. **產品 (product)**:一個 Chrome 擴充功能,在 YouTube 影片上顯示**雙字幕 (dual subtitles)**,每條可選語言、可拖曳、可設樣式、永遠最上層、可關閉。
2. **Rigor harness(測試骨架)**:讓 Claude Code 能以 `編輯 → verify → 讀失敗 → 修` 的迴圈**自動收斂**,極少重試、極少人介入。核心手法是 **relocate rigor**:把行為從「難測的瀏覽器外殼」搬到「可狠測的純核心」。

目標 #2 形塑 #1:為了讓擴充功能可被 property/mutation 測試,架構必須把**決策放進純函式核心 (pure core)**,把 **DOM / YouTube / 瀏覽器**壓成薄薄的可替換 adapter。

---

## 1. 讓自動化收斂的三個前提

| 前提 | 怎麼達成 |
|---|---|
| **確定性 (determinism)** | 迴圈內不碰真實網路 / 真實時間 / 真 YouTube。timedtext 用錄好的 fixture 回放、時間用 fake timer、fast-check 固定 seed。唯一的非確定性(錄真實 fixture)隔離到人工 `npm run record`,不在任何自動關卡。 |
| **又快又精準定位的回饋** | 決策都在細小純函式;property test 的 shrink 給出**最小反例 (minimal counterexample)**;失敗訊息指到確切函式 + 具體輸入。 |
| **測試本身不是假的(防作弊)** | **mutation testing (Stryker)** 翻轉核心的運算子/條件,存活的變異體 = 測試有洞。這是阻止模型「寫不會斷言的斷言」唯一的護欄。 |

---

## 2. 架構 (Architecture) — Approach A:純核心 + 薄 adapter

```
youtube-dual-subs/
├── src/
│   ├── core/                  ← 純。永不 import chrome/document/window/fetch。
│   │   ├── timedtext-url.ts        buildTimedTextUrl(track, tlang)
│   │   ├── parse.ts               parseTimedText(xml) → Cue[]
│   │   ├── cue-select.ts          selectCue(cues, t) / tick reducer
│   │   ├── anchor.ts              resolveAnchor / pickVerticalEdge
│   │   ├── geometry.ts            toFraction / fromFraction / clampFraction / avoidOverlap
│   │   ├── style.ts               styleToCss(settings)
│   │   ├── mount.ts               decideMountTarget(mode, fullscreenEl)
│   │   ├── lifecycle.ts           純 reducer: (state, event) → state
│   │   └── types.ts
│   ├── adapters/              ← 薄接線。沒有決策、沒有分支邏輯。
│   │   ├── net.ts                 fetch(url) → text
│   │   ├── storage.ts             chrome.storage.sync get/set
│   │   ├── player.ts              讀 <video>、currentTime、顯示模式、fullscreen 元素
│   │   ├── renderer.ts            依 render model 畫疊層 + 拖曳發光
│   │   └── clock.ts               requestAnimationFrame / timeupdate
│   ├── content.ts             ← composition root:把 adapter 接到 core 迴圈
│   ├── popup/                 ← 設定 UI(每條字幕語言、樣式、總開關)
│   └── manifest.json          ← MV3
├── tests/
│   ├── core/*.prop.test.ts    fast-check 屬性測試
│   ├── core/*.test.ts         範例測試
│   ├── adapters/*.contract.test.ts  adapter 契約測試
│   └── smoke/*.spec.ts        Playwright(固定 fixture 頁面)
├── fixtures/                  ← 錄好的 timedtext XML + 仿 YouTube 頁面
├── stryker.conf.json          mutation testing(只針對 src/core)
├── playwright.config.ts
└── package.json               verify / verify:full / record
```

**鐵則(由 lint 強制,不靠自律):** `src/core/**` 不得 import `chrome`、`document`、`window`、`fetch`。用 ESLint `no-restricted-imports` / `import/no-restricted-paths` 擋住。這條規則讓可測試面積不會被侵蝕。

### 系統邊界 (boundaries) — 6 個 ports

判準:**任何碰到 `chrome` / `document` / `window` / `fetch` / `Date.now` / `requestAnimationFrame` 的東西 = adapter。其餘是 core。**

| Port | 方向 | 職責 | Adapter |
|---|---|---|---|
| net | driven | 抓 timedtext XML | `net.ts` |
| storage | driven | 讀寫設定 | `storage.ts` |
| player | driving | 讀 currentTime、video rect、顯示模式、fullscreen 元素 | `player.ts` |
| renderer | driven | 把 render model 畫成 DOM、畫拖曳發光 | `renderer.ts` |
| clock | driving | 時間來源(rAF / timeupdate) | `clock.ts` |
| input | driving | 拖曳滑鼠事件、popup 控制 | `content.ts` / `popup/` |

core 收到的永遠是純資料(數字、字串、物件),吐出的也是純資料(新狀態、render model、要執行的指令)。

---

## 3. 字幕管線 (Subtitle pipeline)

**來源:** YouTube `timedtext` 端點 + `tlang` 參數做 auto-translate。**Client-only,無 API key、無後端。** 只在影片至少有一條字幕軌時可用。

**流程(每條字幕各跑一次):**
```
偵測可用字幕軌 → buildTimedTextUrl(track, tlang)
  → net.fetchText(url)  (adapter)
  → parseTimedText(xml) → Cue[]   (core, 純)
  → 每幀: clock 給 currentTime (adapter)
        → tick(state, currentTime, cues) → {state, renderCommand?}  (core, 純)
        → 若有 renderCommand → renderer 畫出  (adapter)
```

**生命週期 (lifecycle)** 是純 reducer:`idle → loadingTracks → active → error`。`error` 收到 `retry` 回到 `loadingTracks`。用 fast-check 對隨機事件序列測「永不進入非法狀態」。

---

## 4. 產品行為 (Product behavior)

### 4.1 雙字幕 = 兩個獨立 box (Model B)

兩條字幕是**兩個完全獨立的 box**,各顯示一種語言,各自擁有:語言、樣式、anchor、vEdge、拖曳狀態、拖曳發光。

```ts
type BoxConfig = {
  id: 'sub1' | 'sub2'
  lang: string                      // tlang 目標語言
  style: StyleSettings              // 字級、顏色、背景透明度、字體、描邊
  posByMode: Record<DisplayMode, Placement>
}
type Placement = { anchor: 'video' | 'page', vEdge: 'top' | 'bottom', fx: number, fy: number }
type Settings = { enabled: boolean, boxes: [BoxConfig, BoxConfig] }
```

### 4.2 渲染 (rendering)

- **自繪疊層 (own overlay)**,不用 YouTube 原生字幕(要雙語、拖曳、自訂樣式、最上層)。
- **box 大小由內容決定 (content-sized)**:寬度隨文字長大,設 `max-width`(參考框的比例,預設 ~80%),超過就**換行 (wrap)**。高度由瀏覽器依字級 × 行數自動算。「box 大小」是輸出,不是輸入 → 不會有「文字超出 box」。

### 4.3 座標系與 anchor

- **座標一律用 viewport 座標**;讀 player 用 `getBoundingClientRect()`,讀 viewport 用 `document.documentElement.clientWidth/Height`(**排除捲軸 scrollbar**)。
- 位置存成「相對參考框的小數比例 (fraction)」,**允許超出 0~1**(代表拖到框外)。
- **雙模式 anchor(由放開位置決定):**
  - 放在 **player 內** → `anchor:'video'`,疊層掛在 player 容器、`position:absolute`、座標 = player rect 的 %。**隨 player 移動/捲動**(往下看留言時字幕跟著影片捲走,不擋留言)。
  - 放在 **player 外** → `anchor:'page'`,`position:fixed`、座標 = viewport 的 %。**釘在畫面上**,捲動與 player RWD 都不影響。
- **依顯示模式各記一組**位置。

### 4.4 顯示模式 (display modes)

`default / theater / fullscreen / miniplayer` 各記一組位置。**PiP(子母畫面)不支援疊層**(瀏覽器獨立視窗,content script 進不去)→ 偵測到就暫停疊層,退出 PiP 再恢復。fullscreen / miniplayer 固定 `anchor:'video'`。

**永遠最上層 + 全螢幕重掛載:** 高 `z-index`;`fullscreenchange` + `MutationObserver` 偵測模式變化,用純函式 `decideMountTarget(mode, fullscreenEl)` 決定該掛到哪個容器(全螢幕時**必須**掛在 fullscreen 子樹內),adapter 只負責實際 attach。

### 4.5 生長方向 (grow direction)

box 隨文字往哪長,由 `vEdge` 決定,**在放開當下決定並存檔**(不在渲染時重算,避免文字變動時方向翻轉跳動):
- 放在**上半**(fy < 0.5)→ `vEdge:'top'`,釘上緣、**往下長**。
- 放在**下半**(fy ≥ 0.5)→ `vEdge:'bottom'`,釘下緣、**往上長**。

渲染:水平 `translateX(-50%)` 置中到 `fx`;垂直依 `vEdge`(top → 上緣對齊 fy、`translateY(0)`;bottom → 下緣對齊 fy、`translateY(-100%)`)。

### 4.6 拖曳防丟 (clamp)

`clampFraction` 把 box 夾在「參考框內留邊界」,純防止被拖到完全看不見。**吃「adapter 量到的 box size」當參數**(box 大小是動態的),維持純函式。

### 4.7 重疊避讓 (overlap) — 兩 box

只在**同 anchor**的兩塊間處理(不同 anchor 座標系不同、各自移動,不強求)。
- **策略:放開時推開 (drop-time)**:拖曳放開那一刻跑 `avoidOverlap`,若與另一塊重疊就推到最近的不重疊位置。
- **播放中動態重疊**:允許(罕見,取決於使用者放的位置)。先不做即時分開(YAGNI),需要再加。

### 4.8 拖曳發光 UX (anchor glow)

拖曳時把「會 attach 的 anchor rect」用**內側發光 (inner glow)** 高亮。**一律用 inner glow(不靠外暈)**,因為 anchor 是 viewport 時外暈會落在螢幕外看不到。
- 整圈:**柔和、範圍小的流動彩虹底光**(`conic-gradient` + `@property` 旋轉),表示「放開將錨定到此」。
- **釘住的單邊(vEdge)加強**:inner + outer 更亮、範圍更大,指出停靠邊 = 生長方向的反向。
- **模式徽章**:「錨定影片」/「浮動畫面」,告知放開後的結果。
- 決策純函式:`resolveAnchor(point, playerRect)`(video/page)、`pickVerticalEdge(fy)`(top/bottom);adapter 只把對應 class 套上去畫,視覺由 screenshot baseline 把關。
- mockups:`docs/superpowers/mockups/anchor-glow*.html`。

### 4.9 樣式、開關、持久化

- **樣式 (style):** 每 box 各自 — 字級、顏色、背景透明度、字體、描邊。`styleToCss(settings)` 純函式,popup 即時預覽。
- **開關 (toggle):** popup 總開關;關掉移除疊層、停止 tick。
- **持久化:** `chrome.storage.sync`(跨裝置同步)。

---

## 5. 純核心函式與不變式 (Pure core + invariants)

這是模型的「客觀通過標準」。每個純函式配一組 property。

| 函式 | 不變式 (invariants) |
|---|---|
| `parseTimedText(xml)` | 永不丟例外;結果按 `start` **單調遞增 (monotonic)**;每個 cue `start < end`。**(+ golden 比對真實 fixture)** |
| `selectCue(cues, t)` | 回傳的 cue(若有)滿足 `start <= t < end`(半開區間,防 off-by-one);t 落在所有 cue 外回 `null`;與線性掃描 oracle 一致 |
| `tick(state, t, cues)` | 不為「不含 t 的 cue」發 renderCommand;t 未跨 cue 邊界則不發(不無謂重畫);純函式同輸入同輸出 |
| `resolveAnchor(pt, rect)` | 點在 rect 內回 `'video'`,否則 `'page'` |
| `pickVerticalEdge(fy)` | `fy < 0.5` → `'top'`;`>= 0.5` → `'bottom'`;邊界 0.5 行為明確 |
| `toFraction / fromFraction` | round-trip:`fromFraction(toFraction(p, box), box) ≈ p` |
| `clampFraction(f, size, box, margin)` | 結果至少留 margin 在框內;本來在界內則不變(冪等 idempotent) |
| `avoidOverlap(moved, others, gap)` | 輸出不與任何 others 重疊(留 ≥ gap);位移最小;冪等;本來不重疊則不動 |
| `styleToCss(s)` | 任何合法 settings 產出合法 CSS(色為合法色、字級為正);round-trip(若做反序列化) |
| `buildTimedTextUrl(track, tlang)` | 一定含 `tlang`;對任何 tlang 產出合法 URL |
| `decideMountTarget(mode, fsEl)` | fullscreen 時回傳 fullscreen 子樹內的目標;否則回頂層 layer |
| `lifecycle(state, event)` | 任意事件序列不進非法狀態;`error + retry → loadingTracks` |

---

## 6. Adapters(薄)與契約測試 (contract tests)

adapter 不含邏輯,只接線。各配一個小契約測試,用**假的瀏覽器 API**(注入 fake `fetch` / `chrome.storage`)驗證它守住 core 依賴的介面。範例:

```ts
// storage.contract.test.ts
test('round-trips settings', async () => {
  const storage = createStorageAdapter(makeInMemoryChromeStorage())
  await storage.save(SETTINGS); expect(await storage.load()).toEqual(SETTINGS)
})
test('returns defaults when empty', async () => {
  const storage = createStorageAdapter(makeInMemoryChromeStorage())
  expect(await storage.load()).toEqual(DEFAULT_SETTINGS)
})
// net.contract.test.ts
test('returns text on ok / throws on non-ok', async () => {
  expect(await createNetAdapter(okFetch('<x/>')).fetchText('u')).toBe('<x/>')
  await expect(createNetAdapter(notOkFetch(404)).fetchText('u')).rejects.toThrow()
})
```

---

## 7. Rigor harness:內層 / 外層迴圈

**內層 `npm run verify`(秒級,每次編輯都跑):**
```
tsc --noEmit  →  eslint(含 no-DOM-in-core)  →  屬性測試 (property) + 範例測試 (example) + 契約測試 (contract)
```

**外層 `npm run verify:full`(分鐘級,功能完成 / 合併前):**
```
verify  →  golden(限 parser)  →  mutation(Stryker,限 src/core,門檻 ≥ 85%)  →  smoke(Playwright + fixture 頁面)
```

**確定性工具:** fixtures 回放 timedtext、fake timer 驅動時間、fast-check 固定 seed。`npm run record`(人工錄真實 fixture)隔離在外。

### A–G 補強(達成自動化的關鍵)

- **A. 完成定義 (Definition of Done),機器可檢查** — 見 §9。
- **B. smoke 失敗自動留證** — Playwright `trace/screenshot/video: 'retain-on-failure'`;主動收 `console` 與 `pageerror`(未攔截例外)並於失敗印出。模型用 Read 看 PNG 自我診斷。
- **C. adapter 契約測試** — 見 §6。
- **D. 錯誤路徑測試 (error-path)** — timedtext 404、無字幕軌、網路失敗 → 測 lifecycle 的 error 事件,不只 happy path。
- **E. 需求↔測試可追溯 (traceability)** — 每條需求至少對應一個測試(命名慣例 / 對照表,機器可檢查)。
- **F. CI** — GitHub Actions 跑 `verify:full` 當後盾。
- **G. 修 bug 先寫紅燈測試** — 每個 bug 先寫會失敗的重現測試再修。

---

## 8. Smoke test 設計

**環境(全確定性):** build `dist/` → Playwright 載入未封裝擴充功能(`--load-extension=dist` + persistent context)→ 開 `fixtures/` 仿 YouTube 頁面(`<video>` + 相同 selector + 可切 theater/fullscreen)→ `page.route()` 攔截 timedtext 回放 fixture → 用程式設定 `currentTime` + 派發 `timeupdate` → 固定 viewport。

**斷言(每條對應需求 → E):**
1. 注入不爆(`pageerror` = 0;疊層存在)
2. 兩個獨立 box 各顯示對應語言文字
3. 時間同步(設 currentTime → 顯示對應 cue)
4. 拖曳 + anchor(放 player 內 → `data-anchor=video`;放外 → `position:fixed`/`data-anchor=page`;存的位置變)
5. 生長方向(放上半 → `vEdge=top`;下半 → `vEdge=bottom`)
6. 重疊避讓(同 anchor 兩塊放開後不重疊)
7. 關開關 → 疊層消失、tick 停
8. 顯示模式切換 → 重掛正確容器、套該模式位置
9. 視覺基準(可選)`toHaveScreenshot()`(人核准一次)

**失敗留證:** trace / screenshot / video + console + pageerror。

---

## 9. Definition of Done

**(a) 機器可檢查:** `verify:full` 全綠;mutation `src/core` ≥ 85%;每條需求有對應測試(E)。

**(b) 視覺/layout:** 純單元測不了「好不好看」,用兩招變可檢查 —
1. **screenshot baseline**(Playwright `toHaveScreenshot`):關鍵畫面存基準圖,**人核准一次**(UX 判斷進場點),之後自動比對。
2. **結構斷言 (structural assertion)**:很多「layout 對不對」可寫成 DOM 斷言。

**(c) UX 意圖 → 可檢查條件**(使用者只給意圖,由實作翻譯):

| UX 意圖 | 翻成 |
|---|---|
| 字幕別擋到底部控制列 | `字幕.bottom < 控制列.top`(結構斷言) |
| 改字級即時反映 | computed `font-size` == 設定值(結構斷言) |
| 拖曳時 anchor inner glow | screenshot baseline(拖曳中) |
| 整體協調不醜 | screenshot baseline + 人核准 |

---

## 10. 測試策略總表(每種測試回答不同問題)

| 測試 | 回答 | 跑在哪 |
|---|---|---|
| 屬性測試 (property) | 對**所有**輸入正確嗎? | 純核心 |
| 範例測試 (example) | 對**我在意的**輸入、**人判斷**對嗎? | 純核心 |
| 黃金測試 (golden) | 輸出**跟上次比有變嗎**?(便宜抓回歸) | 純核心(parser) |
| 契約測試 (contract) | 薄 adapter 守住 core 要的介面嗎? | adapter + fake API |
| 冒煙測試 (smoke) | 組進**真瀏覽器**會不會動? | 真實環境 |
| 變異測試 (mutation) | 上面那些測試**是不是假的**? | 純核心 |

---

## 11. 範圍外 / YAGNI / 未來

- PiP 內疊層(技術不可行)→ 暫停處理。
- 外部翻譯 API(改用 client-only timedtext)。
- 即時動態重疊分開(先只做 drop-time)。
- `selectCue` 二分搜尋優化(字幕量小,線性即可;若優化才需 oracle 等價測試)。
- box `max-width`/`max-height` 設定化、字幕陰影/動畫等樣式擴充。

---

## 12. 風險 / 要盯著的點

- **timedtext 格式漂移**:YouTube 改格式會讓 parser 失準。靠 golden + 定期人工 `record` 重錄偵測。
- **rigor 從 core 漏出去**:fullscreen 重掛載、模式偵測的「決策」要保持在純函式(`decideMountTarget`),adapter 只做 attach。
- **動態重疊**:已知接受罕見情況;若實測常見再升級為即時分開。
- **timedtext 取得**:YouTube 近期需要 player response / innertube 才能拿到字幕軌 URL(pot token 等)。實作時 player adapter 要處理「如何取得可用軌與其 baseUrl」,此屬 adapter 細節,不影響 core。

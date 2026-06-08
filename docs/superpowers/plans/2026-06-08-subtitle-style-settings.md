# Subtitle Style Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user style each of the two subtitle boxes independently from the popup (font color, background color, background transparency, font size, outline), applied live without a Save button.

**Architecture:** A new `bgColor` field on `StyleSettings` plus a pure `hexToRgb` helper let `styleToCss` compose `rgba()` from color+opacity. Storage gets a default + migration for legacy data. The popup is rewritten with per-box controls that debounce-save to `chrome.storage.sync`; `content.ts` already re-applies style on `storage.onChanged`, so no content-script change is needed.

**Tech Stack:** TypeScript, esbuild (`node build.mjs`), Vitest (+ fast-check property tests), Chrome MV3 storage API.

---

### Task 1: `hexToRgb` pure helper

**Files:**
- Modify: `src/core/style.ts`
- Test: `tests/core/style.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/style.test.ts`:

```ts
import { hexToRgb } from '../../src/core/style'

test('hexToRgb parses 6-digit hex', () => {
  expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 })
})

test('hexToRgb accepts no leading hash and uppercase', () => {
  expect(hexToRgb('FFFFFF')).toEqual({ r: 255, g: 255, b: 255 })
})

test('hexToRgb expands 3-digit shorthand', () => {
  expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 })
})

test('hexToRgb falls back to black on malformed input', () => {
  expect(hexToRgb('nope')).toEqual({ r: 0, g: 0, b: 0 })
  expect(hexToRgb('#12')).toEqual({ r: 0, g: 0, b: 0 })
  expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/style.test.ts`
Expected: FAIL — `hexToRgb` is not exported / not a function.

- [ ] **Step 3: Implement `hexToRgb`**

Add to `src/core/style.ts` (above `styleToCss`):

```ts
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const black = { r: 0, g: 0, b: 0 }
  if (typeof hex !== 'string') return black
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return black
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/style.test.ts`
Expected: PASS (the new `hexToRgb` tests; existing `styleToCss` tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/core/style.ts tests/core/style.test.ts
git commit -m "feat(core): add hexToRgb pure helper"
```

---

### Task 2: `bgColor` field + `styleToCss` composes background from color + opacity

**Files:**
- Modify: `src/core/types.ts:9-15` (StyleSettings)
- Modify: `src/core/style.ts` (styleToCss)
- Test: `tests/core/style.test.ts`, `tests/core/style.prop.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `tests/core/style.test.ts`, every `styleToCss({...})` literal needs the new `bgColor` field, and the background assertions change. Replace the existing tests (the `styleToCss` ones — keep the `hexToRgb` tests from Task 1) with:

```ts
test('maps settings to css declarations', () => {
  const css = styleToCss({ fontSizePx: 24, color: '#fff', bgColor: '#000000', bgOpacity: 0.6, fontFamily: 'Arial', outline: true })
  expect(css.fontSize).toBe('24px')
  expect(css.color).toBe('#fff')
  expect(css.backgroundColor).toBe('rgba(0,0,0,0.6)')
  expect(css.fontFamily).toBe('Arial')
  expect(css.textShadow).not.toBe('none')
})

test('background color is composed from bgColor + bgOpacity', () => {
  const css = styleToCss({ fontSizePx: 24, color: '#fff', bgColor: '#ff8800', bgOpacity: 0.5, fontFamily: 'x', outline: false })
  expect(css.backgroundColor).toBe('rgba(255,136,0,0.5)')
})

test('outline:false yields textShadow none', () => {
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgColor: '#000000', bgOpacity: 0.5, fontFamily: 'x', outline: false }).textShadow).toBe('none')
})

test('outline:true yields the exact shadow string (not empty)', () => {
  // kills StringLiteral mutant that replaces the shadow with ''
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgColor: '#000000', bgOpacity: 0.5, fontFamily: 'x', outline: true }).textShadow)
    .toBe('0 2px 6px rgba(0,0,0,0.85)')
})

test('bgOpacity below 0 and above 1 is clamped into [0,1]', () => {
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgColor: '#000000', bgOpacity: -0.5, fontFamily: 'x', outline: false }).backgroundColor)
    .toBe('rgba(0,0,0,0)')
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgColor: '#000000', bgOpacity: 2, fontFamily: 'x', outline: false }).backgroundColor)
    .toBe('rgba(0,0,0,1)')
})
```

In `tests/core/style.prop.test.ts`, add `bgColor` to the literal and keep the black-background regex (still valid). Replace the whole file with:

```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { styleToCss } from '../../src/core/style'

test('background opacity is always within [0,1] in the output', () => {
  fc.assert(fc.property(
    fc.double({ min: -5, max: 5, noNaN: true }),
    fc.integer({ min: 1, max: 200 }),
    (op, size) => {
      const css = styleToCss({ fontSizePx: size, color: '#000', bgColor: '#000000', bgOpacity: op, fontFamily: 'x', outline: false })
      const m = /rgba\(0,0,0,([\d.]+)\)/.exec(css.backgroundColor)
      if (!m) return false
      const a = parseFloat(m[1]!)
      return a >= 0 && a <= 1 && css.fontSize === `${size}px`
    },
  ))
})

test('any valid 6-hex bgColor yields rgb channels in 0..255', () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 0xffffff }),
    (n) => {
      const hex = '#' + n.toString(16).padStart(6, '0')
      const css = styleToCss({ fontSizePx: 20, color: '#000', bgColor: hex, bgOpacity: 0.5, fontFamily: 'x', outline: false })
      const m = /rgba\((\d+),(\d+),(\d+),0\.5\)/.exec(css.backgroundColor)
      if (!m) return false
      return [m[1], m[2], m[3]].every((c) => { const v = Number(c); return v >= 0 && v <= 255 })
    },
  ))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/style.test.ts tests/core/style.prop.test.ts`
Expected: FAIL — TypeScript error "bgColor does not exist on StyleSettings" and/or `rgba(255,136,0,0.5)` assertion fails.

- [ ] **Step 3: Add `bgColor` to the type**

In `src/core/types.ts`, update `StyleSettings` (currently lines 9-15):

```ts
export type StyleSettings = {
  fontSizePx: number
  color: string
  bgColor: string // hex, e.g. '#000000'
  bgOpacity: number // 0..1
  fontFamily: string
  outline: boolean
}
```

- [ ] **Step 4: Update `styleToCss` to compose the background**

In `src/core/style.ts`, replace the `styleToCss` body:

```ts
export function styleToCss(s: StyleSettings): CssDeclarations {
  const { r, g, b } = hexToRgb(s.bgColor)
  return {
    fontSize: `${s.fontSizePx}px`,
    color: s.color,
    backgroundColor: `rgba(${r},${g},${b},${clamp01(s.bgOpacity)})`,
    fontFamily: s.fontFamily,
    textShadow: s.outline ? '0 2px 6px rgba(0,0,0,0.85)' : 'none',
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/style.test.ts tests/core/style.prop.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/style.ts tests/core/style.test.ts tests/core/style.prop.test.ts
git commit -m "feat(core): compose subtitle background from bgColor + bgOpacity"
```

---

### Task 3: Storage default + migration for legacy settings

**Files:**
- Modify: `src/adapters/storage.ts`
- Test: `tests/adapters/storage.contract.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/adapters/storage.contract.test.ts`:

```ts
test('fills missing bgColor on legacy persisted settings', async () => {
  const area = fakeArea()
  const legacy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  delete legacy.boxes[0].style.bgColor // simulate data saved before bgColor existed
  await area.set({ dualSubsSettings: legacy })
  const store = createStorageAdapter(area)
  const loaded = await store.load()
  expect(loaded.boxes[0].style.bgColor).toBe('#000000')
  expect(loaded.boxes[1].style.bgColor).toBe('#000000')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adapters/storage.contract.test.ts`
Expected: FAIL — `loaded.boxes[0].style.bgColor` is `undefined`.

- [ ] **Step 3: Add default + migration**

In `src/adapters/storage.ts`, add `bgColor` to `DEFAULT_STYLE` (line 5-7):

```ts
const DEFAULT_STYLE: StyleSettings = {
  fontSizePx: 24, color: '#ffffff', bgColor: '#000000', bgOpacity: 0.55, fontFamily: 'system-ui, sans-serif', outline: true,
}
```

Then replace the adapter's `load` (currently lines 27-31) to merge each box's style over `DEFAULT_STYLE`:

```ts
    async load() {
      const got = await area.get(KEY)
      const value = (got as Record<string, unknown>)[KEY] as Settings | undefined
      if (!value) return DEFAULT_SETTINGS
      const boxes = value.boxes.map((b) => ({ ...b, style: { ...DEFAULT_STYLE, ...b.style } }))
      return { ...value, boxes: boxes as [BoxConfig, BoxConfig] }
    },
```

(`BoxConfig` is already imported on line 1.)

- [ ] **Step 4: Run the test suite to verify it passes**

Run: `npx vitest run tests/adapters/storage.contract.test.ts`
Expected: PASS — including the existing "round-trips settings" and "returns defaults when empty" tests (the merge is identity for complete data).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/storage.ts tests/adapters/storage.contract.test.ts
git commit -m "feat(storage): default bgColor + migrate legacy style settings"
```

---

### Task 4: Popup UI with per-box live-save controls

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.ts`

No unit test — the popup is pure DOM wiring with no business logic (per CLAUDE.md / spec). Verified by build + manual check in Step 4.

- [ ] **Step 1: Rewrite the popup markup**

Replace the entire contents of `src/popup/popup.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body{font:14px system-ui;width:300px;padding:12px}
  label{display:block;margin:8px 0 2px}
  select,input[type=number]{box-sizing:border-box;margin-top:2px}
  fieldset{border:1px solid #ddd;border-radius:8px;margin:10px 0;padding:6px 10px 10px}
  legend{font-weight:600;padding:0 4px}
  .row{display:flex;align-items:center;gap:8px;margin:6px 0}
  .row label{margin:0;flex:1}
  .row input[type=color]{width:40px;height:26px;padding:0;border:1px solid #ccc;background:none}
  .row input[type=number]{width:70px}
  fieldset select{width:100%}
  input[type=range]{width:100%}
  #hint{color:#888;margin:10px 0 0;font-size:12px}
</style>
</head><body>
  <label><input type="checkbox" id="enabled" style="width:auto"> Enable dual subtitles</label>
  <label><input type="checkbox" id="native" style="width:auto"> Also show YouTube's original subtitles</label>

  <fieldset>
    <legend>Subtitle 1</legend>
    <label>Language <select id="lang0"></select></label>
    <div class="row"><label for="color0">Font color</label><input type="color" id="color0"></div>
    <div class="row"><label for="bgColor0">Background color</label><input type="color" id="bgColor0"></div>
    <label for="bgOpacity0">Background opacity <span id="bgOpacityVal0"></span></label>
    <input type="range" id="bgOpacity0" min="0" max="100">
    <div class="row"><label for="size0">Font size</label><input type="number" id="size0" min="10" max="80"></div>
    <div class="row"><label for="outline0">Outline</label><input type="checkbox" id="outline0" style="width:auto"></div>
  </fieldset>

  <fieldset>
    <legend>Subtitle 2</legend>
    <label>Language <select id="lang1"></select></label>
    <div class="row"><label for="color1">Font color</label><input type="color" id="color1"></div>
    <div class="row"><label for="bgColor1">Background color</label><input type="color" id="bgColor1"></div>
    <label for="bgOpacity1">Background opacity <span id="bgOpacityVal1"></span></label>
    <input type="range" id="bgOpacity1" min="0" max="100">
    <div class="row"><label for="size1">Font size</label><input type="number" id="size1" min="10" max="80"></div>
    <div class="row"><label for="outline1">Outline</label><input type="checkbox" id="outline1" style="width:auto"></div>
  </fieldset>

  <p id="hint"></p>
  <script type="module" src="popup.js"></script>
</body></html>
```

- [ ] **Step 2: Rewrite the popup script**

Replace the entire contents of `src/popup/popup.ts`:

```ts
import { createStorageAdapter } from '../adapters/storage'
import { selectorForTrack } from '../core/track-select'

const store = createStorageAdapter(chrome.storage.sync)
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

type TrackInfo = { languageCode: string; name?: string; kind?: string }

// Ask the active tab's content script which caption tracks the current video offers.
function queryTracks(): Promise<TrackInfo[]> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id
      if (id == null) { resolve([]); return }
      chrome.tabs.sendMessage(id, { type: 'dual-subs:getTracks' }, (resp: unknown) => {
        if (chrome.runtime.lastError || !Array.isArray(resp)) { resolve([]); return }
        resolve(resp as TrackInfo[])
      })
    })
  })
}

function fillSelect(sel: HTMLSelectElement, tracks: TrackInfo[], current: string) {
  sel.innerHTML = ''
  sel.add(new Option('(off)', ''))
  const seen = new Set<string>()
  for (const t of tracks) {
    const value = selectorForTrack(t)
    sel.add(new Option(t.name ? `${t.name} (${t.languageCode})` : value, value))
    seen.add(value)
  }
  if (current && !seen.has(current)) sel.add(new Option(`${current} (not on this video)`, current))
  sel.value = current
}

async function init() {
  const s = await store.load()

  // Debounce writes: color/range fire 'input' rapidly and chrome.storage.sync
  // has write-rate quotas. content.ts applies changes live via storage.onChanged.
  let timer: number | undefined
  const scheduleSave = () => {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => { void store.save(s) }, 150) as unknown as number
  }

  const enabled = $('enabled') as HTMLInputElement
  const native = $('native') as HTMLInputElement
  enabled.checked = s.enabled
  native.checked = s.nativeSubtitles ?? false
  enabled.addEventListener('change', () => { s.enabled = enabled.checked; scheduleSave() })
  native.addEventListener('change', () => { s.nativeSubtitles = native.checked; scheduleSave() })

  const tracks = await queryTracks()
  $('hint').textContent = tracks.length
    ? `${tracks.length} subtitle track(s) on this video`
    : 'Open a YouTube video to list its subtitle tracks'

  s.boxes.forEach((box, i) => {
    const lang = $(`lang${i}`) as HTMLSelectElement
    const color = $(`color${i}`) as HTMLInputElement
    const bgColor = $(`bgColor${i}`) as HTMLInputElement
    const bgOpacity = $(`bgOpacity${i}`) as HTMLInputElement
    const bgOpacityVal = $(`bgOpacityVal${i}`)
    const size = $(`size${i}`) as HTMLInputElement
    const outline = $(`outline${i}`) as HTMLInputElement

    fillSelect(lang, tracks, box.lang)
    color.value = box.style.color
    bgColor.value = box.style.bgColor
    bgOpacity.value = String(Math.round(box.style.bgOpacity * 100))
    bgOpacityVal.textContent = `${bgOpacity.value}%`
    size.value = String(box.style.fontSizePx)
    outline.checked = box.style.outline

    lang.addEventListener('change', () => { box.lang = lang.value; scheduleSave() })
    color.addEventListener('input', () => { box.style.color = color.value; scheduleSave() })
    bgColor.addEventListener('input', () => { box.style.bgColor = bgColor.value; scheduleSave() })
    bgOpacity.addEventListener('input', () => {
      box.style.bgOpacity = Number(bgOpacity.value) / 100
      bgOpacityVal.textContent = `${bgOpacity.value}%`
      scheduleSave()
    })
    size.addEventListener('input', () => { box.style.fontSizePx = parseInt(size.value, 10) || 24; scheduleSave() })
    outline.addEventListener('change', () => { box.style.outline = outline.checked; scheduleSave() })
  })
}
void init()
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run verify && node build.mjs`
Expected: typecheck + lint + unit tests PASS; `dist/` rebuilds with no errors.

- [ ] **Step 4: Manual verification (real environment)**

Load `dist/` unpacked via `chrome://extensions`, open a real YouTube video with two caption tracks, open the popup, and confirm:
- Both "Subtitle 1" and "Subtitle 2" sections show current color/bg/opacity/size/outline values.
- Changing Subtitle 1's **font color** updates its on-screen box **live** (no Save, no reload).
- Changing **Background color** and **Background opacity** updates the box background live; the `%` label tracks the slider.
- Reopening the popup shows the persisted values.

- [ ] **Step 5: Commit**

```bash
git add src/popup/popup.html src/popup/popup.ts
git commit -m "feat(popup): per-box live subtitle style controls"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `npm run verify:full`
Expected: verify + golden + mutation (core ≥ 85%) + build + smoke all PASS. If mutation on `style.ts` drops below threshold, add a targeted test that kills the surviving mutant (e.g. asserting a specific non-black channel value).

- [ ] **Step 2: Commit any test additions**

```bash
git add -A
git commit -m "test(core): shore up mutation coverage for style composition"
```

(Skip this commit if `verify:full` passed with no changes.)

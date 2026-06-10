# Subtitle Style Settings in Popup — Design

**Date:** 2026-06-08
**Status:** Approved (pending spec review)

## Goal

Let the user style each of the two subtitle boxes independently from the popup:
font color, background color, background transparency, font size, and outline.
Changes apply **live** (no Save button) while the popup is open.

## Decisions

- **Per-box styling** — Subtitle 1 and Subtitle 2 each have their own full style.
- **Live preview** — controls apply immediately via a debounced write to
  `chrome.storage.sync`; `content.ts` already re-applies style on `storage.onChanged`.
- **No font-family control** — `fontFamily` stays in the model at its default value
  but is *not* user-editable. (Dropped from scope per user.)

## Controls (per box, 5 total)

| Control | Element | Model field |
|---|---|---|
| Font color | `<input type=color>` | `style.color` |
| Background color | `<input type=color>` | `style.bgColor` *(new)* |
| Background transparency | `<input type=range>` 0–100% | `style.bgOpacity` |
| Font size | `<input type=number>` 10–80 | `style.fontSizePx` (now per-box, was shared) |
| Outline | `<input type=checkbox>` | `style.outline` |

## Components & changes

### 1. Data model — `src/core/types.ts`
Add `bgColor: string` (hex, e.g. `'#000000'`) to `StyleSettings`. All other fields
already exist.

### 2. Pure style mapping — `src/core/style.ts`
- Add pure `hexToRgb(hex: string): { r: number; g: number; b: number }`.
  - Accepts `#rrggbb`, `#rgb`, and the same without `#`.
  - Malformed input falls back to `{ r: 0, g: 0, b: 0 }` (never `NaN`).
- `styleToCss` changes `backgroundColor` from the hardcoded
  `rgba(0,0,0,${opacity})` to `rgba(${r},${g},${b},${opacity})` derived from
  `bgColor` + `bgOpacity`.
- Lives in core (no DOM/`chrome`/`window`), satisfying the `no-restricted-globals`
  lint rule.

### 3. Storage default + migration — `src/adapters/storage.ts`
- `DEFAULT_STYLE` gains `bgColor: '#000000'`.
- `load()` migrates persisted settings that predate `bgColor`: for each box, fill any
  missing style field from `DEFAULT_STYLE`. Without this, an old saved value yields
  `rgba(NaN,NaN,NaN,opacity)` and the background breaks.

### 4. Popup UI — `src/popup/popup.html` + `src/popup/popup.ts`
- Two sections ("Subtitle 1" / "Subtitle 2"), each with the 5 controls above.
- On `input`/`change`, update the in-memory `Settings` and schedule a **debounced**
  (~150ms) `store.save(s)`. No Save button; the existing enable/native/language
  controls move to the same live-save model for consistency (see "Live-save scope").
- Reason for debounce: `color`/`range` fire `input` rapidly; `chrome.storage.sync`
  has write-rate quotas (~120 writes/min, ~1.8s min between same-key writes is
  generous but bursts must be coalesced).

### 5. Content script — `src/content.ts`
No change. `storage.onChanged → applySettings → views[id].setStyle(styleToCss(...))`
already propagates style live.

## Live-save scope

To keep behavior consistent, **all** popup controls (enable, native, language,
and the new style controls) switch to debounced live-save, and the explicit
**Save button is removed**. Closing the popup is no longer required to persist.
Language changes still trigger a re-fetch in `content.ts` (already handled in
`applySettings` when `box.lang` differs).

## Testing (TDD)

- `tests/core/style.test.ts` — extend:
  - background color composed from `bgColor` + `bgOpacity`.
  - `hexToRgb` boundaries: `#000`, `#ffffff`, no-`#`, malformed → `{0,0,0}`.
- `tests/core/style.prop.test.ts` — property: any valid 6-hex + opacity in [0,1]
  produces a well-formed `rgba(r,g,b,a)` with r,g,b in 0–255.
- Storage migration test (`tests/adapters/storage.test.ts` or new): a persisted
  settings object missing `bgColor` loads with `bgColor === '#000000'`.
- Popup is pure DOM wiring (no business logic) → no unit test; covered by
  smoke / manual verification.

## Done = real-environment check

On a real YouTube video (non-automated browser), open the popup, change Subtitle 1's
font color and background transparency, and observe the on-screen box update **live**
without pressing Save and without reloading the page.

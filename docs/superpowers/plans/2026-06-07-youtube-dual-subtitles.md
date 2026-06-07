# YouTube Dual Subtitles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that shows two independently draggable, styleable subtitle boxes on YouTube (each its own language via the `timedtext` `tlang` auto-translate), behind a rigor harness (property + golden + mutation + smoke) so an agent can self-iterate to "done".

**Architecture:** Ports-and-adapters. A pure `src/core/**` (no `chrome`/`document`/`window`/`fetch`, lint-enforced) holds every decision as pure functions; thin `src/adapters/**` wire the browser. `content.ts` is the composition root. Rigor is concentrated on the pure core; one smoke test covers the wiring.

**Tech Stack:** TypeScript (strict), Vitest + fast-check (unit/property), Stryker (mutation, core only), Playwright (smoke), ESLint (typescript-eslint + a no-DOM-in-core rule), esbuild (bundle).

---

## File Structure

```
src/
  core/        types.ts, timedtext-url.ts, entities.ts, parse.ts, cue-select.ts,
               tick.ts, lifecycle.ts, anchor.ts, geometry.ts, overlap.ts,
               style.ts, mount.ts
  adapters/    net.ts, storage.ts, player.ts, renderer.ts, clock.ts
  content.ts   composition root
  popup/       popup.html, popup.ts
  manifest.json
tests/
  core/        *.test.ts (example) + *.prop.test.ts (property)
  adapters/    *.contract.test.ts
  golden/      parse.golden.test.ts
  smoke/       extension.spec.ts, fixtures/ (fake YouTube page + timedtext xml)
fixtures/      timedtext-sample.xml (shared)
build.mjs, eslint.config.mjs, tsconfig.json, vitest.config.ts,
playwright.config.ts, stryker.conf.json, package.json
.github/workflows/verify.yml
```

---

## Task 1: Scaffold project + inner-loop harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`
- Create: `src/core/sanity.ts`, `tests/core/sanity.prop.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "youtube-dual-subs",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test:unit": "vitest run tests/core tests/adapters",
    "test:golden": "vitest run tests/golden",
    "test:mutation": "stryker run",
    "build": "node build.mjs",
    "test:smoke": "playwright test",
    "verify": "npm run typecheck && npm run lint && npm run test:unit",
    "verify:full": "npm run verify && npm run test:golden && npm run test:mutation && npm run build && npm run test:smoke",
    "record": "node scripts/record.mjs"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@stryker-mutator/core": "^8.7.1",
    "@stryker-mutator/vitest-runner": "^8.7.1",
    "@types/chrome": "^0.0.287",
    "@types/node": "^22.10.0",
    "esbuild": "^0.24.0",
    "eslint": "^9.17.0",
    "fast-check": "^3.23.1",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (strict)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "types": ["node", "chrome"],
    "noEmit": true
  },
  "include": ["src", "tests", "build.mjs"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `eslint.config.mjs`** (the no-DOM-in-core rule lives here)

```js
import tseslint from 'typescript-eslint'

const BANNED_IN_CORE = [
  { name: 'document', message: 'core must be pure: no DOM' },
  { name: 'window', message: 'core must be pure: no window' },
  { name: 'fetch', message: 'core must be pure: no fetch' },
  { name: 'chrome', message: 'core must be pure: no chrome API' },
  { name: 'requestAnimationFrame', message: 'core must be pure: no rAF' },
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...BANNED_IN_CORE],
      'no-restricted-imports': ['error', { patterns: ['**/adapters/*', '**/adapters/**'] }],
    },
  },
)
```

- [ ] **Step 5: Write the failing sanity property test**

`tests/core/sanity.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { double } from '../../src/core/sanity'

test('double is always even-ish: double(n) === n + n', () => {
  fc.assert(fc.property(fc.integer(), (n) => double(n) === n + n))
})
```

- [ ] **Step 6: Run it, verify it fails**

Run: `npm install && npx vitest run tests/core/sanity.prop.test.ts`
Expected: FAIL — cannot find module `../../src/core/sanity`.

- [ ] **Step 7: Implement `src/core/sanity.ts`**

```ts
export function double(n: number): number {
  return n + n
}
```

- [ ] **Step 8: Run verify, expect green**

Run: `npm run verify`
Expected: typecheck PASS, lint PASS, unit tests PASS.

- [ ] **Step 9: Commit**

```bash
git init
printf "node_modules/\ndist/\ntest-results/\n.stryker-tmp/\nreports/\n" > .gitignore
git add -A
git commit -m "chore: scaffold project + inner-loop verify harness"
```

---

## Task 2: Prove the no-DOM-in-core lint rule has teeth

**Files:** temporary edit to `src/core/sanity.ts` (reverted).

- [ ] **Step 1: Temporarily add a DOM reference to core**

Append to `src/core/sanity.ts`:
```ts
export function bad(): number {
  return document.querySelectorAll('div').length
}
```

- [ ] **Step 2: Run lint, verify it FAILS on the rule**

Run: `npm run lint`
Expected: FAIL — `Unexpected use of 'document'. core must be pure: no DOM` at `src/core/sanity.ts`.

- [ ] **Step 3: Revert**

Remove the `bad()` function from `src/core/sanity.ts`.

- [ ] **Step 4: Run lint, expect clean; commit nothing**

Run: `npm run lint`
Expected: PASS. (No commit — this task only verifies the guardrail.)

---

## Task 3: Core types

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: Write `src/core/types.ts`**

```ts
export type Cue = { start: number; end: number; text: string }

export type DisplayMode = 'default' | 'theater' | 'fullscreen' | 'miniplayer'
export type Anchor = 'video' | 'page'
export type VEdge = 'top' | 'bottom'

export type Placement = { anchor: Anchor; vEdge: VEdge; fx: number; fy: number }

export type StyleSettings = {
  fontSizePx: number
  color: string
  bgOpacity: number // 0..1
  fontFamily: string
  outline: boolean
}

export type BoxId = 'sub1' | 'sub2'
export type BoxConfig = {
  id: BoxId
  lang: string
  style: StyleSettings
  posByMode: Record<DisplayMode, Placement>
}
export type Settings = { enabled: boolean; boxes: [BoxConfig, BoxConfig] }

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type Fraction = { fx: number; fy: number }

export type Track = { baseUrl: string }

export type LifecycleState =
  | { kind: 'idle' }
  | { kind: 'loadingTracks' }
  | { kind: 'active' }
  | { kind: 'error'; message: string }
export type LifecycleEvent =
  | { type: 'enable' }
  | { type: 'tracksLoaded' }
  | { type: 'failed'; message: string }
  | { type: 'retry' }
  | { type: 'disable' }

export type TickState = { activeText: string | null }
export type RenderCommand = { text: string | null }

export type MountTarget = { kind: 'fullscreen' } | { kind: 'overlayLayer' }
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): shared types"
```

---

## Task 4: `buildTimedTextUrl`

**Files:**
- Create: `src/core/timedtext-url.ts`, `tests/core/timedtext-url.prop.test.ts`, `tests/core/timedtext-url.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/timedtext-url.test.ts`:
```ts
import { expect, test } from 'vitest'
import { buildTimedTextUrl } from '../../src/core/timedtext-url'

test('adds tlang and fmt to the base url', () => {
  const url = buildTimedTextUrl({ baseUrl: 'https://yt/api/timedtext?v=abc&lang=en' }, 'zh-Hant')
  const u = new URL(url)
  expect(u.searchParams.get('tlang')).toBe('zh-Hant')
  expect(u.searchParams.get('fmt')).toBe('srv1')
  expect(u.searchParams.get('v')).toBe('abc')
})
```

- [ ] **Step 2: Failing property test**

`tests/core/timedtext-url.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { buildTimedTextUrl } from '../../src/core/timedtext-url'

const langArb = fc.constantFrom('en', 'zh-Hant', 'ja', 'ko', 'fr', 'de', 'es')

test('result always carries the requested tlang', () => {
  fc.assert(fc.property(langArb, (lang) => {
    const url = buildTimedTextUrl({ baseUrl: 'https://yt/api/timedtext?v=x' }, lang)
    return new URL(url).searchParams.get('tlang') === lang
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/timedtext-url`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/timedtext-url.ts`**

```ts
import type { Track } from './types'

export function buildTimedTextUrl(track: Track, tlang: string): string {
  const url = new URL(track.baseUrl)
  url.searchParams.set('tlang', tlang)
  url.searchParams.set('fmt', 'srv1')
  return url.toString()
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): buildTimedTextUrl"
```

---

## Task 5: HTML entity decoding (`entities.ts`)

**Files:**
- Create: `src/core/entities.ts`, `tests/core/entities.test.ts`, `tests/core/entities.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/entities.test.ts`:
```ts
import { expect, test } from 'vitest'
import { decodeEntities } from '../../src/core/entities'

test('decodes named and numeric entities', () => {
  expect(decodeEntities('a &amp; b')).toBe('a & b')
  expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>')
  expect(decodeEntities('it&#39;s &quot;ok&quot;')).toBe(`it's "ok"`)
  expect(decodeEntities('&#x41;')).toBe('A')
})
```

- [ ] **Step 2: Failing property test**

`tests/core/entities.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { decodeEntities } from '../../src/core/entities'

test('never throws on arbitrary input', () => {
  fc.assert(fc.property(fc.string(), (s) => {
    decodeEntities(s)
    return true
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/entities`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/entities.ts`**

```ts
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED[body] ?? match
  })
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): decodeEntities"
```

---

## Task 6: `parseTimedText`

**Files:**
- Create: `src/core/parse.ts`, `tests/core/parse.test.ts`, `tests/core/parse.prop.test.ts`
- Create: `fixtures/timedtext-sample.xml`

- [ ] **Step 1: Create the shared fixture `fixtures/timedtext-sample.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<transcript>
<text start="0.5" dur="1.5">Hello &amp; welcome</text>
<text start="2.0" dur="2.25">It&#39;s a test</text>
<text start="4.5" dur="1.0">&lt;end&gt;</text>
</transcript>
```

- [ ] **Step 2: Failing example test**

`tests/core/parse.test.ts`:
```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTimedText } from '../../src/core/parse'

const xml = readFileSync(new URL('../../fixtures/timedtext-sample.xml', import.meta.url), 'utf8')

test('parses cues with decoded text and computed end', () => {
  const cues = parseTimedText(xml)
  expect(cues).toEqual([
    { start: 0.5, end: 2.0, text: 'Hello & welcome' },
    { start: 2.0, end: 4.25, text: "It's a test" },
    { start: 4.5, end: 5.5, text: '<end>' },
  ])
})
```

- [ ] **Step 3: Failing property tests** (the invariants from the spec)

`tests/core/parse.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { parseTimedText } from '../../src/core/parse'

test('never throws on arbitrary input', () => {
  fc.assert(fc.property(fc.string(), (s) => { parseTimedText(s); return true }))
})

// Build well-formed XML from random cues, then assert invariants on the parse.
const cueArb = fc.record({
  start: fc.double({ min: 0, max: 10000, noNaN: true }),
  dur: fc.double({ min: 0.01, max: 100, noNaN: true }),
  text: fc.string(),
})

function toXml(cues: { start: number; dur: number; text: string }[]): string {
  const rows = cues.map(c =>
    `<text start="${c.start}" dur="${c.dur}">${c.text.replace(/[&<>]/g, '')}</text>`).join('\n')
  return `<transcript>${rows}</transcript>`
}

test('cues are monotonic by start and each has start < end', () => {
  fc.assert(fc.property(fc.array(cueArb), (cues) => {
    const parsed = parseTimedText(toXml(cues))
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i]!.start < parsed[i - 1]!.start) return false
    }
    return parsed.every(c => c.start < c.end)
  }))
})
```

- [ ] **Step 4: Run, verify fail**

Run: `npx vitest run tests/core/parse`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/core/parse.ts`** (regex parse, no DOM)

```ts
import type { Cue } from './types'
import { decodeEntities } from './entities'

const ROW = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g

export function parseTimedText(xml: string): Cue[] {
  const cues: Cue[] = []
  let m: RegExpExecArray | null
  ROW.lastIndex = 0
  while ((m = ROW.exec(xml)) !== null) {
    const start = parseFloat(m[1]!)
    const dur = parseFloat(m[2]!)
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) continue
    cues.push({ start, end: start + dur, text: decodeEntities(m[3]!).trim() })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}
```

- [ ] **Step 6: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): parseTimedText"
```

---

## Task 7: `selectCue` (with oracle property)

**Files:**
- Create: `src/core/cue-select.ts`, `tests/core/cue-select.test.ts`, `tests/core/cue-select.prop.test.ts`

- [ ] **Step 1: Failing example test (boundary focus)**

`tests/core/cue-select.test.ts`:
```ts
import { expect, test } from 'vitest'
import { selectCue } from '../../src/core/cue-select'
import type { Cue } from '../../src/core/types'

const cues: Cue[] = [
  { start: 1, end: 2, text: 'A' },
  { start: 2, end: 3, text: 'B' },
]

test('half-open interval [start,end): exact end belongs to next cue', () => {
  expect(selectCue(cues, 1)!.text).toBe('A')
  expect(selectCue(cues, 1.999)!.text).toBe('A')
  expect(selectCue(cues, 2)!.text).toBe('B')   // off-by-one guard
  expect(selectCue(cues, 0.5)).toBeNull()
  expect(selectCue(cues, 3)).toBeNull()
})
```

- [ ] **Step 2: Failing property test (contains-t + oracle)**

`tests/core/cue-select.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { selectCue } from '../../src/core/cue-select'
import type { Cue } from '../../src/core/types'

const cuesArb = fc.array(fc.record({
  start: fc.double({ min: 0, max: 100, noNaN: true }),
  len: fc.double({ min: 0.1, max: 10, noNaN: true }),
  text: fc.string(),
})).map(rows => {
  let t = 0
  const cues: Cue[] = []
  for (const r of rows) { t += r.start * 0; const start = t; const end = start + r.len; cues.push({ start, end, text: r.text }); t = end }
  return cues
})

// reference oracle: trivially-correct linear scan
function oracle(cues: Cue[], t: number): Cue | null {
  for (const c of cues) if (c.start <= t && t < c.end) return c
  return null
}

test('returned cue always contains t; matches the oracle', () => {
  fc.assert(fc.property(cuesArb, fc.double({ min: 0, max: 120, noNaN: true }), (cues, t) => {
    const got = selectCue(cues, t)
    if (got && !(got.start <= t && t < got.end)) return false
    return got === oracle(cues, t)
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/cue-select`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/cue-select.ts`**

```ts
import type { Cue } from './types'

export function selectCue(cues: Cue[], t: number): Cue | null {
  for (const c of cues) {
    if (c.start <= t && t < c.end) return c
  }
  return null
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): selectCue with oracle property"
```

---

## Task 8: `tick` reducer (time-sync decision, no rAF)

**Files:**
- Create: `src/core/tick.ts`, `tests/core/tick.test.ts`, `tests/core/tick.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/tick.test.ts`:
```ts
import { expect, test } from 'vitest'
import { initTick, tick } from '../../src/core/tick'
import type { Cue } from '../../src/core/types'

const cues: Cue[] = [{ start: 0, end: 1, text: 'A' }, { start: 1, end: 2, text: 'B' }]

test('emits a command only when the active cue changes', () => {
  const r1 = tick(initTick(), 0.5, cues)
  expect(r1.renderCommand).toEqual({ text: 'A' })
  const r2 = tick(r1.state, 0.7, cues)        // same cue
  expect(r2.renderCommand).toBeUndefined()
  const r3 = tick(r2.state, 1.5, cues)        // crossed into B
  expect(r3.renderCommand).toEqual({ text: 'B' })
  const r4 = tick(r3.state, 5, cues)          // off the end
  expect(r4.renderCommand).toEqual({ text: null })
})
```

- [ ] **Step 2: Failing property test**

`tests/core/tick.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { initTick, tick } from '../../src/core/tick'
import type { Cue } from '../../src/core/types'

const cues: Cue[] = [{ start: 0, end: 1, text: 'A' }, { start: 1, end: 2, text: 'B' }]

test('never emits a command for text that does not match the active cue at t', () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 3, noNaN: true }), (t) => {
    const { renderCommand } = tick(initTick(), t, cues)
    const expected = t >= 0 && t < 1 ? 'A' : t >= 1 && t < 2 ? 'B' : null
    return renderCommand !== undefined && renderCommand.text === expected
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/tick`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/tick.ts`**

```ts
import type { Cue, RenderCommand, TickState } from './types'
import { selectCue } from './cue-select'

export function initTick(): TickState {
  return { activeText: undefined as unknown as string | null }
}

export function tick(
  state: TickState,
  currentTime: number,
  cues: Cue[],
): { state: TickState; renderCommand?: RenderCommand } {
  const cue = selectCue(cues, currentTime)
  const text = cue ? cue.text : null
  if (text === state.activeText) return { state }
  return { state: { activeText: text }, renderCommand: { text } }
}
```

> Note: `initTick()` uses a sentinel distinct from `null` so the first tick always emits (even when the first state is "no subtitle"). The property test's first call therefore always returns a command.

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): tick reducer"
```

---

## Task 9: `lifecycle` reducer

**Files:**
- Create: `src/core/lifecycle.ts`, `tests/core/lifecycle.test.ts`, `tests/core/lifecycle.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/lifecycle.test.ts`:
```ts
import { expect, test } from 'vitest'
import { initLifecycle, lifecycle } from '../../src/core/lifecycle'

test('happy path and error->retry', () => {
  let s = initLifecycle()
  s = lifecycle(s, { type: 'enable' });           expect(s.kind).toBe('loadingTracks')
  s = lifecycle(s, { type: 'tracksLoaded' });      expect(s.kind).toBe('active')
  s = lifecycle(s, { type: 'failed', message: 'x' }); expect(s.kind).toBe('error')
  s = lifecycle(s, { type: 'retry' });             expect(s.kind).toBe('loadingTracks')
  s = lifecycle(s, { type: 'disable' });           expect(s.kind).toBe('idle')
})
```

- [ ] **Step 2: Failing property test (no illegal state from any sequence)**

`tests/core/lifecycle.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { initLifecycle, lifecycle } from '../../src/core/lifecycle'
import type { LifecycleEvent } from '../../src/core/types'

const eventArb: fc.Arbitrary<LifecycleEvent> = fc.oneof(
  fc.constant({ type: 'enable' } as const),
  fc.constant({ type: 'tracksLoaded' } as const),
  fc.constant({ type: 'retry' } as const),
  fc.constant({ type: 'disable' } as const),
  fc.string().map((m) => ({ type: 'failed', message: m } as const)),
)
const VALID = new Set(['idle', 'loadingTracks', 'active', 'error'])

test('any event sequence yields a valid state', () => {
  fc.assert(fc.property(fc.array(eventArb), (events) => {
    let s = initLifecycle()
    for (const e of events) s = lifecycle(s, e)
    return VALID.has(s.kind)
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/lifecycle`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/lifecycle.ts`**

```ts
import type { LifecycleEvent, LifecycleState } from './types'

export function initLifecycle(): LifecycleState {
  return { kind: 'idle' }
}

export function lifecycle(state: LifecycleState, event: LifecycleEvent): LifecycleState {
  switch (event.type) {
    case 'enable':
      return state.kind === 'idle' ? { kind: 'loadingTracks' } : state
    case 'tracksLoaded':
      return state.kind === 'loadingTracks' ? { kind: 'active' } : state
    case 'failed':
      return { kind: 'error', message: event.message }
    case 'retry':
      return state.kind === 'error' ? { kind: 'loadingTracks' } : state
    case 'disable':
      return { kind: 'idle' }
  }
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): lifecycle reducer"
```

---

## Task 10: `anchor.ts` — `resolveAnchor` + `pickVerticalEdge`

**Files:**
- Create: `src/core/anchor.ts`, `tests/core/anchor.test.ts`, `tests/core/anchor.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/anchor.test.ts`:
```ts
import { expect, test } from 'vitest'
import { resolveAnchor, pickVerticalEdge } from '../../src/core/anchor'

const player = { x: 100, y: 50, width: 800, height: 450 }

test('resolveAnchor: inside player -> video, outside -> page', () => {
  expect(resolveAnchor({ x: 500, y: 200 }, player)).toBe('video')
  expect(resolveAnchor({ x: 10, y: 10 }, player)).toBe('page')
})

test('pickVerticalEdge: top half -> top, bottom half -> bottom (0.5 inclusive -> bottom)', () => {
  expect(pickVerticalEdge(0.2)).toBe('top')
  expect(pickVerticalEdge(0.5)).toBe('bottom')
  expect(pickVerticalEdge(0.9)).toBe('bottom')
})
```

- [ ] **Step 2: Failing property test**

`tests/core/anchor.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { pickVerticalEdge } from '../../src/core/anchor'

test('pickVerticalEdge partitions at 0.5', () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (fy) => {
    return pickVerticalEdge(fy) === (fy < 0.5 ? 'top' : 'bottom')
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/anchor`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/anchor.ts`**

```ts
import type { Anchor, Point, Rect, VEdge } from './types'

export function resolveAnchor(point: Point, playerRect: Rect): Anchor {
  const inX = point.x >= playerRect.x && point.x <= playerRect.x + playerRect.width
  const inY = point.y >= playerRect.y && point.y <= playerRect.y + playerRect.height
  return inX && inY ? 'video' : 'page'
}

export function pickVerticalEdge(fy: number): VEdge {
  return fy < 0.5 ? 'top' : 'bottom'
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): resolveAnchor + pickVerticalEdge"
```

---

## Task 11: `geometry.ts` — fraction conversion, box rect, clamp

**Files:**
- Create: `src/core/geometry.ts`, `tests/core/geometry.test.ts`, `tests/core/geometry.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/geometry.test.ts`:
```ts
import { expect, test } from 'vitest'
import { toFraction, fromFraction, computeBoxRect, clampFraction } from '../../src/core/geometry'

const box = { x: 100, y: 50, width: 800, height: 400 }

test('toFraction / fromFraction round-trip', () => {
  const p = { x: 500, y: 250 }
  const f = toFraction(p, box)
  const back = fromFraction(f, box)
  expect(back.x).toBeCloseTo(p.x)
  expect(back.y).toBeCloseTo(p.y)
})

test('computeBoxRect: bottom edge pins to fy and grows up', () => {
  const r = computeBoxRect({ fx: 0.5, fy: 1 }, box, { width: 200, height: 60 }, 'bottom')
  expect(r.x).toBeCloseTo(100 + 0.5 * 800 - 100) // centered: cx=500, left=400
  expect(r.y).toBeCloseTo(50 + 400 - 60)         // bottom at 450 -> top=390
})

test('clampFraction keeps the rendered box inside the viewport', () => {
  const vp = { width: 1000, height: 500 }
  const f = clampFraction({ fx: 5, fy: 5 }, box, { width: 200, height: 60 }, 'top', vp, 8)
  const r = computeBoxRect(f, box, { width: 200, height: 60 }, 'top')
  expect(r.x).toBeGreaterThanOrEqual(8 - 0.001)
  expect(r.x + r.width).toBeLessThanOrEqual(1000 - 8 + 0.001)
  expect(r.y + r.height).toBeLessThanOrEqual(500 - 8 + 0.001)
})
```

- [ ] **Step 2: Failing property tests (within-viewport + idempotent)**

`tests/core/geometry.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { computeBoxRect, clampFraction } from '../../src/core/geometry'
import type { VEdge } from '../../src/core/types'

const box = { x: 100, y: 50, width: 800, height: 400 }
const vp = { width: 1200, height: 700 }
const sizeArb = fc.record({ width: fc.integer({ min: 10, max: 600 }), height: fc.integer({ min: 10, max: 300 }) })
const fArb = fc.record({ fx: fc.double({ min: -3, max: 3, noNaN: true }), fy: fc.double({ min: -3, max: 3, noNaN: true }) })
const edgeArb: fc.Arbitrary<VEdge> = fc.constantFrom('top', 'bottom')

test('clamped box is always within the viewport (margin 8)', () => {
  fc.assert(fc.property(fArb, sizeArb, edgeArb, (f, size, edge) => {
    const c = clampFraction(f, box, size, edge, vp, 8)
    const r = computeBoxRect(c, box, size, edge)
    return r.x >= 8 - 1e-6 && r.y >= 8 - 1e-6 &&
      r.x + r.width <= vp.width - 8 + 1e-6 && r.y + r.height <= vp.height - 8 + 1e-6
  }))
})

test('clampFraction is idempotent', () => {
  fc.assert(fc.property(fArb, sizeArb, edgeArb, (f, size, edge) => {
    const once = clampFraction(f, box, size, edge, vp, 8)
    const twice = clampFraction(once, box, size, edge, vp, 8)
    return Math.abs(once.fx - twice.fx) < 1e-9 && Math.abs(once.fy - twice.fy) < 1e-9
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/geometry`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/geometry.ts`**

```ts
import type { Fraction, Point, Rect, Size, VEdge } from './types'

export function toFraction(point: Point, box: Rect): Fraction {
  return { fx: (point.x - box.x) / box.width, fy: (point.y - box.y) / box.height }
}

export function fromFraction(f: Fraction, box: Rect): Point {
  return { x: box.x + f.fx * box.width, y: box.y + f.fy * box.height }
}

// The rendered box rect in viewport coords. Horizontal: centered on fx. Vertical: the
// pinned edge (vEdge) sits at fy; the box grows away from it.
export function computeBoxRect(f: Fraction, box: Rect, size: Size, vEdge: VEdge): Rect {
  const cx = box.x + f.fx * box.width
  const anchorY = box.y + f.fy * box.height
  const x = cx - size.width / 2
  const y = vEdge === 'top' ? anchorY : anchorY - size.height
  return { x, y, width: size.width, height: size.height }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clampFraction(
  f: Fraction, box: Rect, size: Size, vEdge: VEdge, viewport: Size, margin: number,
): Fraction {
  const r = computeBoxRect(f, box, size, vEdge)
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  const left = clamp(r.x, margin, maxX)
  const top = clamp(r.y, margin, maxY)
  const cx = left + size.width / 2
  const anchorY = vEdge === 'top' ? top : top + size.height
  return { fx: (cx - box.x) / box.width, fy: (anchorY - box.y) / box.height }
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): geometry (fraction, box rect, clamp)"
```

---

## Task 12: `overlap.ts` — `avoidOverlap`

**Files:**
- Create: `src/core/overlap.ts`, `tests/core/overlap.test.ts`, `tests/core/overlap.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/overlap.test.ts`:
```ts
import { expect, test } from 'vitest'
import { avoidOverlap, rectsOverlap } from '../../src/core/overlap'

test('pushes the moved rect clear of the other with a gap', () => {
  const a = { x: 0, y: 100, width: 100, height: 40 }
  const other = { x: 20, y: 110, width: 100, height: 40 }
  const out = avoidOverlap(a, [other], 8)
  expect(rectsOverlap(out, other, 8)).toBe(false)
})

test('no-op when already clear', () => {
  const a = { x: 0, y: 0, width: 50, height: 20 }
  const other = { x: 0, y: 200, width: 50, height: 20 }
  expect(avoidOverlap(a, [other], 8)).toEqual(a)
})
```

- [ ] **Step 2: Failing property tests (no overlap + idempotent)**

`tests/core/overlap.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { avoidOverlap, rectsOverlap } from '../../src/core/overlap'

const rectArb = fc.record({
  x: fc.integer({ min: 0, max: 500 }), y: fc.integer({ min: 0, max: 500 }),
  width: fc.integer({ min: 10, max: 200 }), height: fc.integer({ min: 10, max: 80 }),
})

test('output never overlaps the single other (gap 8)', () => {
  fc.assert(fc.property(rectArb, rectArb, (a, other) => {
    const out = avoidOverlap(a, [other], 8)
    return !rectsOverlap(out, other, 8)
  }))
})

test('idempotent', () => {
  fc.assert(fc.property(rectArb, rectArb, (a, other) => {
    const once = avoidOverlap(a, [other], 8)
    const twice = avoidOverlap(once, [other], 8)
    return JSON.stringify(once) === JSON.stringify(twice)
  }))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/overlap`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/overlap.ts`**

```ts
import type { Rect } from './types'

export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  )
}

// Drop-time avoidance: push `moved` vertically by the smallest amount that clears
// each overlapping other. Designed for the two-box case (one other).
export function avoidOverlap(moved: Rect, others: Rect[], gap: number): Rect {
  let r: Rect = { ...moved }
  for (const o of others) {
    if (!rectsOverlap(r, o, gap)) continue
    const moveUp = o.y - gap - (r.y + r.height) // negative dy to sit above o
    const moveDown = o.y + o.height + gap - r.y  // positive dy to sit below o
    const dy = Math.abs(moveUp) <= Math.abs(moveDown) ? moveUp : moveDown
    r = { ...r, y: r.y + dy }
  }
  return r
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): avoidOverlap"
```

---

## Task 13: `style.ts` — `styleToCss`

**Files:**
- Create: `src/core/style.ts`, `tests/core/style.test.ts`, `tests/core/style.prop.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/style.test.ts`:
```ts
import { expect, test } from 'vitest'
import { styleToCss } from '../../src/core/style'

test('maps settings to css declarations', () => {
  const css = styleToCss({ fontSizePx: 24, color: '#fff', bgOpacity: 0.6, fontFamily: 'Arial', outline: true })
  expect(css.fontSize).toBe('24px')
  expect(css.color).toBe('#fff')
  expect(css.backgroundColor).toBe('rgba(0,0,0,0.6)')
  expect(css.fontFamily).toBe('Arial')
  expect(css.textShadow).not.toBe('none')
})
```

- [ ] **Step 2: Failing property test (opacity clamped, font positive)**

`tests/core/style.prop.test.ts`:
```ts
import { test } from 'vitest'
import fc from 'fast-check'
import { styleToCss } from '../../src/core/style'

test('background opacity is always within [0,1] in the output', () => {
  fc.assert(fc.property(
    fc.double({ min: -5, max: 5, noNaN: true }),
    fc.integer({ min: 1, max: 200 }),
    (op, size) => {
      const css = styleToCss({ fontSizePx: size, color: '#000', bgOpacity: op, fontFamily: 'x', outline: false })
      const m = /rgba\(0,0,0,([\d.]+)\)/.exec(css.backgroundColor)
      if (!m) return false
      const a = parseFloat(m[1]!)
      return a >= 0 && a <= 1 && css.fontSize === `${size}px`
    },
  ))
})
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run tests/core/style`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/style.ts`**

```ts
import type { StyleSettings } from './types'

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function styleToCss(s: StyleSettings): Record<string, string> {
  return {
    fontSize: `${s.fontSizePx}px`,
    color: s.color,
    backgroundColor: `rgba(0,0,0,${clamp01(s.bgOpacity)})`,
    fontFamily: s.fontFamily,
    textShadow: s.outline ? '0 2px 6px rgba(0,0,0,0.85)' : 'none',
  }
}
```

- [ ] **Step 5: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): styleToCss"
```

---

## Task 14: `mount.ts` — `decideMountTarget`

**Files:**
- Create: `src/core/mount.ts`, `tests/core/mount.test.ts`

- [ ] **Step 1: Failing example test**

`tests/core/mount.test.ts`:
```ts
import { expect, test } from 'vitest'
import { decideMountTarget } from '../../src/core/mount'

test('fullscreen with a fullscreen element mounts into fullscreen, else overlay layer', () => {
  expect(decideMountTarget('fullscreen', true)).toEqual({ kind: 'fullscreen' })
  expect(decideMountTarget('fullscreen', false)).toEqual({ kind: 'overlayLayer' })
  expect(decideMountTarget('default', true)).toEqual({ kind: 'overlayLayer' })
  expect(decideMountTarget('theater', false)).toEqual({ kind: 'overlayLayer' })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/core/mount`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/mount.ts`**

```ts
import type { DisplayMode, MountTarget } from './types'

export function decideMountTarget(mode: DisplayMode, hasFullscreenEl: boolean): MountTarget {
  if (mode === 'fullscreen' && hasFullscreenEl) return { kind: 'fullscreen' }
  return { kind: 'overlayLayer' }
}
```

- [ ] **Step 4: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(core): decideMountTarget"
```

---

## Task 15: `net` adapter + contract test

**Files:**
- Create: `src/adapters/net.ts`, `tests/adapters/net.contract.test.ts`

- [ ] **Step 1: Failing contract test**

`tests/adapters/net.contract.test.ts`:
```ts
import { expect, test } from 'vitest'
import { createNetAdapter } from '../../src/adapters/net'

const okFetch = (body: string) =>
  (async () => ({ ok: true, status: 200, text: async () => body })) as unknown as typeof fetch
const badFetch = (status: number) =>
  (async () => ({ ok: false, status, text: async () => '' })) as unknown as typeof fetch

test('returns body text on ok', async () => {
  const net = createNetAdapter(okFetch('<x/>'))
  expect(await net.fetchText('https://u')).toBe('<x/>')
})

test('throws on non-ok status', async () => {
  const net = createNetAdapter(badFetch(404))
  await expect(net.fetchText('https://u')).rejects.toThrow(/404/)
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/adapters/net`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/adapters/net.ts`**

```ts
export type Net = { fetchText: (url: string) => Promise<string> }

export function createNetAdapter(fetchFn: typeof fetch = fetch): Net {
  return {
    async fetchText(url) {
      const res = await fetchFn(url, { credentials: 'omit' })
      if (!res.ok) throw new Error(`timedtext fetch failed: ${res.status}`)
      return res.text()
    },
  }
}
```

- [ ] **Step 4: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(adapter): net + contract test"
```

---

## Task 16: `storage` adapter + contract test

**Files:**
- Create: `src/adapters/storage.ts`, `tests/adapters/storage.contract.test.ts`

- [ ] **Step 1: Failing contract test (in-memory fake of chrome.storage)**

`tests/adapters/storage.contract.test.ts`:
```ts
import { expect, test } from 'vitest'
import { createStorageAdapter, DEFAULT_SETTINGS } from '../../src/adapters/storage'
import type { Settings } from '../../src/core/types'

function fakeArea() {
  let data: Record<string, unknown> = {}
  return {
    async get(key: string) { return key in data ? { [key]: data[key] } : {} },
    async set(items: Record<string, unknown>) { data = { ...data, ...items } },
  } as unknown as chrome.storage.StorageArea
}

test('round-trips settings', async () => {
  const store = createStorageAdapter(fakeArea())
  const s: Settings = { ...DEFAULT_SETTINGS, enabled: false }
  await store.save(s)
  expect(await store.load()).toEqual(s)
})

test('returns defaults when empty', async () => {
  const store = createStorageAdapter(fakeArea())
  expect(await store.load()).toEqual(DEFAULT_SETTINGS)
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run tests/adapters/storage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/adapters/storage.ts`**

```ts
import type { BoxConfig, DisplayMode, Placement, Settings, StyleSettings } from '../core/types'

const KEY = 'dualSubsSettings'

const DEFAULT_STYLE: StyleSettings = {
  fontSizePx: 24, color: '#ffffff', bgOpacity: 0.55, fontFamily: 'system-ui, sans-serif', outline: true,
}
const MODES: DisplayMode[] = ['default', 'theater', 'fullscreen', 'miniplayer']
function defaultPlacement(): Placement { return { anchor: 'video', vEdge: 'bottom', fx: 0.5, fy: 0.9 } }
function defaultPos(): Record<DisplayMode, Placement> {
  return MODES.reduce((acc, m) => { acc[m] = defaultPlacement(); return acc }, {} as Record<DisplayMode, Placement>)
}
function box(id: BoxConfig['id'], lang: string): BoxConfig {
  return { id, lang, style: { ...DEFAULT_STYLE }, posByMode: defaultPos() }
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  boxes: [box('sub1', 'en'), box('sub2', 'zh-Hant')],
}

export type Store = { load: () => Promise<Settings>; save: (s: Settings) => Promise<void> }

export function createStorageAdapter(area: chrome.storage.StorageArea): Store {
  return {
    async load() {
      const got = await area.get(KEY)
      const value = (got as Record<string, unknown>)[KEY]
      return value ? (value as Settings) : DEFAULT_SETTINGS
    },
    async save(s) { await area.set({ [KEY]: s }) },
  }
}
```

- [ ] **Step 4: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat(adapter): storage + defaults + contract test"
```

---

## Task 17: `player`, `renderer`, `clock` adapters (thin; covered by smoke)

**Files:**
- Create: `src/adapters/player.ts`, `src/adapters/renderer.ts`, `src/adapters/clock.ts`

> These touch the DOM and are intentionally logic-free. They are exercised by the smoke test (Task 21), not unit tests.

- [ ] **Step 1: Implement `src/adapters/player.ts`**

```ts
import type { DisplayMode, Rect } from '../core/types'

export type Player = {
  video: () => HTMLVideoElement | null
  playerRect: () => Rect
  currentTime: () => number
  displayMode: () => DisplayMode
  fullscreenEl: () => Element | null
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

export function createPlayerAdapter(doc: Document = document): Player {
  const findVideo = () => doc.querySelector<HTMLVideoElement>('video.html5-main-video, video')
  const findPlayer = () => doc.querySelector('#movie_player, .html5-video-player')
  return {
    video: findVideo,
    playerRect: () => {
      const p = findPlayer() ?? findVideo()
      return p ? rectOf(p) : { x: 0, y: 0, width: 0, height: 0 }
    },
    currentTime: () => findVideo()?.currentTime ?? 0,
    displayMode: () => {
      if (doc.fullscreenElement) return 'fullscreen'
      const body = doc.body
      if (body.classList.contains('ytd-miniplayer') || doc.querySelector('ytd-miniplayer[active]')) return 'miniplayer'
      if (doc.querySelector('ytd-watch-flexy[theater]')) return 'theater'
      return 'default'
    },
    fullscreenEl: () => doc.fullscreenElement,
  }
}
```

- [ ] **Step 2: Implement `src/adapters/renderer.ts`**

```ts
import type { Fraction, MountTarget, Rect, Size, VEdge } from '../core/types'
import { computeBoxRect } from '../core/geometry'

export type BoxView = {
  el: HTMLElement
  setText: (text: string | null) => void
  setStyle: (css: Record<string, string>) => void
  place: (f: Fraction, refBox: Rect, vEdge: VEdge) => void
  measure: () => Size
  remove: () => void
}

export function createRenderer(doc: Document = document) {
  let layer: HTMLElement | null = null
  function ensureLayer(target: MountTarget, fullscreenEl: Element | null): HTMLElement {
    const host = target.kind === 'fullscreen' && fullscreenEl ? (fullscreenEl as HTMLElement) : doc.body
    if (!layer || layer.parentElement !== host) {
      layer?.remove()
      layer = doc.createElement('div')
      layer.id = 'dual-subs-layer'
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
      host.appendChild(layer)
    }
    return layer
  }
  function createBox(target: MountTarget, fullscreenEl: Element | null, id: string): BoxView {
    const root = ensureLayer(target, fullscreenEl)
    const el = doc.createElement('div')
    el.className = 'dual-subs-box'
    el.dataset.boxId = id
    el.style.cssText = 'position:fixed;max-width:80vw;text-align:center;padding:6px 12px;border-radius:10px;pointer-events:auto;cursor:grab;white-space:normal;'
    root.appendChild(el)
    return {
      el,
      setText: (text) => { el.style.display = text ? 'block' : 'none'; el.textContent = text ?? '' },
      setStyle: (css) => { Object.assign(el.style, css) },
      place: (f, refBox, vEdge) => {
        const size = { width: el.offsetWidth, height: el.offsetHeight }
        const r = computeBoxRect(f, refBox, size, vEdge)
        el.style.left = `${r.x}px`
        el.style.top = `${r.y}px`
        el.dataset.anchor = f.fx >= 0 && f.fx <= 1 ? 'video-or-page' : 'page'
        el.dataset.vedge = vEdge
      },
      measure: () => ({ width: el.offsetWidth, height: el.offsetHeight }),
      remove: () => el.remove(),
    }
  }
  return { createBox, destroy: () => { layer?.remove(); layer = null } }
}
```

- [ ] **Step 3: Implement `src/adapters/clock.ts`**

```ts
export type Clock = { start: (onTick: (t: number) => void) => void; stop: () => void }

export function createClock(getTime: () => number): Clock {
  let raf = 0
  return {
    start(onTick) {
      const loop = () => { onTick(getTime()); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    },
    stop() { if (raf) cancelAnimationFrame(raf) },
  }
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run verify`
Expected: PASS (lint allows DOM in adapters).
```bash
git add -A && git commit -m "feat(adapter): player, renderer, clock (thin)"
```

---

## Task 18: `content.ts` composition root

**Files:**
- Create: `src/content.ts`

> Wires adapters to the pure core. No decisions here that aren't delegated to core.

- [ ] **Step 1: Implement `src/content.ts`**

```ts
import type { BoxConfig, Cue, DisplayMode, Fraction, Settings } from './core/types'
import { initTick, tick } from './core/tick'
import { resolveAnchor, pickVerticalEdge } from './core/anchor'
import { toFraction, clampFraction, computeBoxRect } from './core/geometry'
import { avoidOverlap } from './core/overlap'
import { styleToCss } from './core/style'
import { decideMountTarget } from './core/mount'
import { buildTimedTextUrl } from './core/timedtext-url'
import { parseTimedText } from './core/parse'
import { createNetAdapter } from './adapters/net'
import { createStorageAdapter } from './adapters/storage'
import { createPlayerAdapter } from './adapters/player'
import { createRenderer, type BoxView } from './adapters/renderer'

async function findTrackBaseUrl(): Promise<string | null> {
  // YouTube exposes caption tracks via the player response. Read the first track's baseUrl.
  const pr = (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse as
    | { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl: string }[] } } }
    | undefined
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return tracks && tracks.length > 0 ? tracks[0]!.baseUrl : null
}

async function main() {
  const store = createStorageAdapter(chrome.storage.sync)
  const net = createNetAdapter()
  const player = createPlayerAdapter()
  const renderer = createRenderer()

  let settings: Settings = await store.load()
  if (!settings.enabled) return

  const base = await findTrackBaseUrl()
  if (!base) return

  const cuesByBox: Record<string, Cue[]> = {}
  for (const box of settings.boxes) {
    const xml = await net.fetchText(buildTimedTextUrl({ baseUrl: base }, box.lang))
    cuesByBox[box.id] = parseTimedText(xml)
  }

  const views: Record<string, BoxView> = {}
  const tickStates: Record<string, ReturnType<typeof initTick>> = {}
  const mode: DisplayMode = player.displayMode()
  for (const box of settings.boxes) {
    const target = decideMountTarget(mode, player.fullscreenEl())
    const view = renderer.createBox(target, player.fullscreenEl(), box.id)
    view.setStyle(styleToCss(box.style))
    views[box.id] = view
    tickStates[box.id] = initTick()
    attachDrag(box, view)
  }

  function render() {
    const t = player.currentTime()
    for (const box of settings.boxes) {
      const res = tick(tickStates[box.id]!, t, cuesByBox[box.id] ?? [])
      tickStates[box.id] = res.state
      if (res.renderCommand) views[box.id]!.setText(res.renderCommand.text)
      const place = box.posByMode[player.displayMode()]
      views[box.id]!.place({ fx: place.fx, fy: place.fy }, player.playerRect(), place.vEdge)
    }
    requestAnimationFrame(render)
  }
  requestAnimationFrame(render)

  function attachDrag(box: BoxConfig, view: BoxView) {
    let dragging = false
    view.el.addEventListener('pointerdown', (e) => {
      dragging = true
      view.el.setPointerCapture(e.pointerId)
    })
    view.el.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const point = { x: e.clientX, y: e.clientY }
      const ref = player.playerRect()
      const anchor = resolveAnchor(point, ref)
      const refBox = anchor === 'video'
        ? ref
        : { x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
      let f: Fraction = toFraction(point, refBox)
      const vEdge = pickVerticalEdge(f.fy)
      const size = view.measure()
      const vp = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
      f = clampFraction(f, refBox, size, vEdge, vp, 8)
      view.place(f, refBox, vEdge)
      stash(box, anchor, vEdge, f)
    })
    view.el.addEventListener('pointerup', async () => {
      dragging = false
      // drop-time overlap avoidance against the other box (same anchor only)
      const me = box.posByMode[player.displayMode()]
      const other = settings.boxes.find((b) => b.id !== box.id)!
      const otherPlace = other.posByMode[player.displayMode()]
      if (me.anchor === otherPlace.anchor) {
        const ref = me.anchor === 'video'
          ? player.playerRect()
          : { x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
        const myRect = computeBoxRect({ fx: me.fx, fy: me.fy }, ref, view.measure(), me.vEdge)
        const otherRect = computeBoxRect({ fx: otherPlace.fx, fy: otherPlace.fy }, ref, views[other.id]!.measure(), otherPlace.vEdge)
        const cleared = avoidOverlap(myRect, [otherRect], 8)
        me.fy = toFraction({ x: cleared.x + cleared.width / 2, y: me.vEdge === 'top' ? cleared.y : cleared.y + cleared.height }, ref).fy
      }
      await store.save(settings)
    })
  }

  function stash(box: BoxConfig, anchor: 'video' | 'page', vEdge: 'top' | 'bottom', f: Fraction) {
    const mode = player.displayMode()
    box.posByMode[mode] = { anchor, vEdge, fx: f.fx, fy: f.fy }
  }
}

void main()
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "feat: content.ts composition root"
```

---

## Task 19: Popup UI (settings)

**Files:**
- Create: `src/popup/popup.html`, `src/popup/popup.ts`

- [ ] **Step 1: Create `src/popup/popup.html`**

```html
<!doctype html>
<html><head><meta charset="utf-8">
<style>body{font:14px system-ui;width:280px;padding:12px}label{display:block;margin:8px 0 2px}</style>
</head><body>
  <label><input type="checkbox" id="enabled"> Enable dual subtitles</label>
  <label>Subtitle 1 language <input id="lang1" placeholder="en"></label>
  <label>Subtitle 2 language <input id="lang2" placeholder="zh-Hant"></label>
  <label>Font size <input id="font" type="number" min="10" max="80"></label>
  <button id="save">Save</button>
  <script type="module" src="popup.js"></script>
</body></html>
```

- [ ] **Step 2: Create `src/popup/popup.ts`**

```ts
import { createStorageAdapter } from '../adapters/storage'

const store = createStorageAdapter(chrome.storage.sync)
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function init() {
  const s = await store.load()
  ;($('enabled') as HTMLInputElement).checked = s.enabled
  ;($('lang1') as HTMLInputElement).value = s.boxes[0].lang
  ;($('lang2') as HTMLInputElement).value = s.boxes[1].lang
  ;($('font') as HTMLInputElement).value = String(s.boxes[0].style.fontSizePx)

  $('save').addEventListener('click', async () => {
    s.enabled = ($('enabled') as HTMLInputElement).checked
    s.boxes[0].lang = ($('lang1') as HTMLInputElement).value || 'en'
    s.boxes[1].lang = ($('lang2') as HTMLInputElement).value || 'zh-Hant'
    const size = parseInt(($('font') as HTMLInputElement).value, 10) || 24
    s.boxes[0].style.fontSizePx = size
    s.boxes[1].style.fontSizePx = size
    await store.save(s)
    window.close()
  })
}
void init()
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.
```bash
git add -A && git commit -m "feat: popup settings UI"
```

---

## Task 20: Manifest + build (esbuild → `dist/`)

**Files:**
- Create: `src/manifest.json`, `build.mjs`

- [ ] **Step 1: Create `src/manifest.json`** (MV3)

```json
{
  "manifest_version": 3,
  "name": "YouTube Dual Subtitles",
  "version": "0.0.1",
  "description": "Two independent, draggable, styleable subtitle tracks on YouTube.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*"],
  "action": { "default_popup": "popup/popup.html" },
  "content_scripts": [
    { "matches": ["https://www.youtube.com/*"], "js": ["content.js"], "run_at": "document_idle" }
  ]
}
```

- [ ] **Step 2: Create `build.mjs`**

```js
import { build } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('dist/popup', { recursive: true })

await build({
  entryPoints: ['src/content.ts', 'src/popup/popup.ts'],
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir: 'dist',
  outbase: 'src',
  logLevel: 'info',
})

cpSync('src/manifest.json', 'dist/manifest.json')
cpSync('src/popup/popup.html', 'dist/popup/popup.html')
console.log('built dist/')
```

- [ ] **Step 3: Build, verify dist/ exists**

Run: `npm run build`
Expected: `dist/content.js`, `dist/popup/popup.js`, `dist/popup/popup.html`, `dist/manifest.json` exist.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "build: MV3 manifest + esbuild bundle"
```

---

## Task 21: Smoke test (Playwright + fixture YouTube page)

**Files:**
- Create: `playwright.config.ts`, `tests/smoke/fixtures/fake-youtube.html`, `tests/smoke/fixtures/timedtext.xml`, `tests/smoke/extension.spec.ts`

- [ ] **Step 1: Create `playwright.config.ts`** (failure artifacts = harness item B)

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/smoke',
  fullyParallel: false,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'reports/playwright' }]],
})
```

- [ ] **Step 2: Create `tests/smoke/fixtures/timedtext.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<transcript>
<text start="0.0" dur="3.0">Hello from the fixture</text>
<text start="3.0" dur="3.0">Second line of text</text>
</transcript>
```

- [ ] **Step 3: Create `tests/smoke/fixtures/fake-youtube.html`** (mimics the bits our code reads)

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Fake YouTube</title>
<style>#movie_player{position:relative;width:800px;height:450px;background:#111;margin:20px}</style>
</head>
<body>
  <ytd-watch-flexy>
    <div id="movie_player" class="html5-video-player">
      <video class="html5-main-video" src=""></video>
    </div>
  </ytd-watch-flexy>
  <script>
    // Minimal player response with one caption track the content script can read.
    window.ytInitialPlayerResponse = {
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [
        { baseUrl: 'https://www.youtube.com/api/timedtext?v=fixture&lang=en' }
      ] } }
    }
    const v = document.querySelector('video')
    Object.defineProperty(v, 'currentTime', { writable: true, value: 0 })
    window.__setTime = (t) => { v.currentTime = t }
  </script>
</body></html>
```

- [ ] **Step 4: Write the smoke test**

`tests/smoke/extension.spec.ts`:
```ts
import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const fixture = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-youtube.html')

let context: BrowserContext

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
})
test.afterAll(async () => { await context.close() })

test('injects, renders both boxes, syncs, drags, toggles', async () => {
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  // Replay timedtext deterministically (any lang/tlang).
  await page.route('**/api/timedtext**', async (route) => {
    const fs = await import('node:fs/promises')
    const xml = await fs.readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/timedtext.xml'), 'utf8')
    await route.fulfill({ status: 200, contentType: 'text/xml', body: xml })
  })

  await page.goto(fixture)
  // 1. injection + no uncaught errors
  const layer = page.locator('#dual-subs-layer')
  await expect(layer).toBeAttached({ timeout: 5000 })
  expect(errors, errors.join('\n')).toHaveLength(0)

  // 2. dual render at t=1 -> first cue text
  await page.evaluate(() => (window as unknown as { __setTime: (t: number) => void }).__setTime(1))
  const boxes = page.locator('.dual-subs-box')
  await expect(boxes).toHaveCount(2)
  await expect(boxes.first()).toContainText('Hello from the fixture')

  // 3. time sync -> second cue
  await page.evaluate(() => (window as unknown as { __setTime: (t: number) => void }).__setTime(4))
  await expect(boxes.first()).toContainText('Second line of text')

  // 4. drag outside the player -> floats (anchor page)
  const before = await boxes.first().boundingBox()
  await page.mouse.move((before!.x) + 5, before!.y + 5)
  await page.mouse.down()
  await page.mouse.move(20, 20)
  await page.mouse.up()
  await expect(boxes.first()).toHaveAttribute('data-anchor', 'page')
})
```

- [ ] **Step 5: Install browser, build, run smoke**

Run:
```bash
npx playwright install chromium
npm run build
npm run test:smoke
```
Expected: PASS (1 test). On failure, artifacts land in `test-results/` and `reports/playwright/`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test(smoke): extension injects/renders/syncs/drags on fixture page"
```

---

## Task 22: Golden test for the parser (outer loop)

**Files:**
- Create: `tests/golden/parse.golden.test.ts`, `tests/golden/__snapshots__/` (auto)

- [ ] **Step 1: Write the golden test**

`tests/golden/parse.golden.test.ts`:
```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTimedText } from '../../src/core/parse'

const xml = readFileSync(new URL('../../fixtures/timedtext-sample.xml', import.meta.url), 'utf8')

test('parseTimedText output matches approved snapshot', () => {
  expect(parseTimedText(xml)).toMatchSnapshot()
})
```

- [ ] **Step 2: Generate + eyeball the snapshot**

Run: `npm run test:golden`
Expected: snapshot written. Open `tests/golden/__snapshots__/parse.golden.test.ts.snap` and confirm the three cues have correct decoded text and timings (this is the one-time human verification that turns the snapshot into a trusted golden).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(golden): parser snapshot"
```

---

## Task 23: Mutation testing (Stryker, core only)

**Files:**
- Create: `stryker.conf.json`

- [ ] **Step 1: Create `stryker.conf.json`**

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts" },
  "mutate": ["src/core/**/*.ts", "!src/core/types.ts"],
  "reporters": ["clear-text", "progress", "html"],
  "htmlReporter": { "fileName": "reports/mutation/index.html" },
  "thresholds": { "high": 90, "low": 85, "break": 85 },
  "coverageAnalysis": "perTest"
}
```

- [ ] **Step 2: Run mutation, read survivors**

Run: `npm run test:mutation`
Expected: mutation score ≥ 85% (build breaks below). If survivors remain, add/strengthen property or example tests in `tests/core/` to kill them, then re-run. Common survivors to expect: `<` vs `<=` in `selectCue` (killed by the boundary example), `0.5` partition in `pickVerticalEdge`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(mutation): stryker config, core >= 85%"
```

---

## Task 24: Error-path tests (harness item D)

**Files:**
- Create: `tests/core/error-paths.test.ts`

- [ ] **Step 1: Write error-path tests**

`tests/core/error-paths.test.ts`:
```ts
import { expect, test } from 'vitest'
import { parseTimedText } from '../../src/core/parse'
import { selectCue } from '../../src/core/cue-select'
import { lifecycle, initLifecycle } from '../../src/core/lifecycle'

test('parse of malformed / empty xml yields [] without throwing', () => {
  expect(parseTimedText('')).toEqual([])
  expect(parseTimedText('<not-xml')).toEqual([])
  expect(parseTimedText('<transcript><text>missing attrs</text></transcript>')).toEqual([])
})

test('selectCue on empty cues is null', () => {
  expect(selectCue([], 5)).toBeNull()
})

test('failed -> error carries message; retry recovers', () => {
  let s = lifecycle(initLifecycle(), { type: 'enable' })
  s = lifecycle(s, { type: 'failed', message: 'network' })
  expect(s).toEqual({ kind: 'error', message: 'network' })
  expect(lifecycle(s, { type: 'retry' }).kind).toBe('loadingTracks')
})
```

- [ ] **Step 2: Run, verify pass; commit**

Run: `npm run verify`
Expected: PASS.
```bash
git add -A && git commit -m "test(core): error-path coverage"
```

---

## Task 25: CI (harness item F) + Definition of Done doc (item A) + traceability (item E)

**Files:**
- Create: `.github/workflows/verify.yml`, `docs/DONE.md`

- [ ] **Step 1: Create `.github/workflows/verify.yml`**

```yaml
name: verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run verify:full
```

- [ ] **Step 2: Create `docs/DONE.md`** (machine-checkable Definition of Done + requirement→test map)

```markdown
# Definition of Done

Machine-checkable:
- [ ] `npm run verify:full` exits 0 (typecheck, lint incl. no-DOM-in-core, unit+property+contract, golden, mutation >= 85%, build, smoke)
- [ ] Mutation score for `src/core` >= 85% (enforced by stryker `break`)

Requirement -> test traceability (item E):
| Requirement | Test |
|---|---|
| Dual subtitles render | smoke: "renders both boxes" + tick tests |
| Per-language selection | storage contract (langs) + buildTimedTextUrl property |
| Source via timedtext+tlang | buildTimedTextUrl tests |
| Parse cues | parse example + property + golden |
| Time sync / no needless redraw | tick example + property |
| Drag + dual-mode anchor | anchor tests + smoke drag (data-anchor=page) |
| Grow direction (vEdge) | pickVerticalEdge tests + geometry computeBoxRect |
| Anti-lost clamp | geometry within-viewport + idempotent properties |
| Overlap avoidance | overlap properties |
| Style | styleToCss tests |
| Always-on-top / fullscreen mount | decideMountTarget tests + smoke layer attached |
| Toggle | storage (enabled) + content guard |
| Error paths | error-paths tests + lifecycle |

Visual (human-approved once):
- [ ] Playwright screenshot baselines for: docked default, floating, dragging glow (added later via `toHaveScreenshot`).
```

- [ ] **Step 3: Run the full outer loop locally**

Run: `npm run verify:full`
Expected: all gates PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "ci: verify:full workflow + Definition of Done + traceability"
```

---

## Self-Review (completed)

**Spec coverage:** every spec section maps to a task — pipeline (T4–T9), product behavior incl. two-box/anchor/vEdge/clamp/overlap/style/mount (T10–T14, T18), adapters+contracts (T15–T17), harness inner/outer + A–G (T1–T2, T21–T25), boundaries enforced by the lint rule (T1–T2). Drag glow visuals are deferred to screenshot baselines (noted in DONE.md), matching the spec's "visual = human-approved baseline".

**Placeholder scan:** no TBD/TODO; every code step has complete code; every command has expected output.

**Type consistency:** `Cue`, `Rect`, `Size`, `Fraction`, `Placement`, `BoxConfig`, `Settings`, `Track`, `TickState`, `MountTarget` defined once in T3 and used consistently; `computeBoxRect`, `clampFraction`, `toFraction`, `avoidOverlap`, `rectsOverlap`, `tick`/`initTick`, `lifecycle`/`initLifecycle`, `decideMountTarget`, `styleToCss`, `createNetAdapter`, `createStorageAdapter`/`DEFAULT_SETTINGS` names match between definition and use.

**Known intentional gaps (YAGNI, per spec §11):** live dynamic overlap separation (drop-time only), `selectCue` binary-search optimization (linear is the oracle), drag-glow rendering polish (visual baselines later), real timedtext fetch quirks (player adapter detail).

# CLAUDE.md — youtube-dual-subs (uds)

A Manifest V3 Chrome extension: two independent, draggable, styleable subtitle boxes on
YouTube. Built behind a rigor harness so an agent can self-iterate.

## Architecture (ports & adapters)

- **`src/core/**`** — pure functions, every decision lives here. **No `chrome`, `document`,
  `window`, `fetch`, `requestAnimationFrame`** (lint-enforced: `no-restricted-globals` +
  no importing adapters). Tested hard (unit + property + golden + mutation).
- **`src/adapters/**`** — thin browser wiring (storage, player, renderer). No business logic.
- **`src/content.ts`** — composition root (isolated world): builds the overlay, runs the
  rAF render loop, drag, live-settings, and sources cues from the bridge.
- **`src/bridge.ts`** — runs in the page **MAIN world** (`"world": "MAIN"` in the manifest).
  Publishes `ytInitialPlayerResponse` to a DOM attr, and **captures the player's caption
  responses** (see below).
- **`src/popup/`** — settings UI (enable, language selectors from the video's real tracks,
  font, "show original YT subtitles").
- Build: **`node build.mjs`** (esbuild) → `dist/`.

## How captions actually work (READ THIS before touching caption code)

YouTube gates the `timedtext` endpoint with a **`pot` (proof-of-origin) token** the player
mints via BotGuard. **A plain `fetch` of the caption `baseUrl` returns an empty 200** — you
cannot fetch captions yourself, and `tlang` self-translation also returns empty. So:

- `bridge.ts` monkey-patches `fetch`/`XMLHttpRequest` to **capture the player's own caption
  responses** and `postMessage`s them to `content.ts` (buffered + replayed on request).
- `content.ts` auto-enables YouTube CC (clicks `.ytp-subtitles-button` + asks the bridge to
  `setOption('captions','track',…)`) to trigger those fetches, parses (`parseCaptions` →
  json3 or srv1), and renders. It loads **one language at a time** (the player fetches one
  track at once). No translation — boxes match the video's own tracks via `pickTrack`.

## Testing

- `npm run verify` — typecheck + lint + unit (`vitest tests/core tests/adapters`). Run this
  for most changes.
- `npm run verify:full` — verify + golden + **mutation (stryker, core ≥ 85%)** + build + smoke.
- `npm run test:smoke` — Playwright. **Extensions only load in Playwright's bundled Chromium
  (`channel: 'chromium'`), NOT Chrome Stable** (148 ignores `--load-extension`). Smoke uses a
  fake-youtube fixture that *fetches* timedtext so the bridge captures it (mirrors the real
  player path).
- `npm run test:live` + `scripts/validate-*.mjs` — **real-environment** drivers (open real
  youtube.com in bundled Chromium). Keep these; they are first-class.
- **TDD is the default**: write the failing test first (see `superpowers:test-driven-development`).

## Environment gotchas (cost real debugging time — don't relearn them)

- **Chrome Stable ignores `--load-extension`** (137+, confirmed 148). Use Playwright's bundled
  Chromium, or load unpacked via `chrome://extensions` (needed when you require a logged-in
  session, e.g. age-gated videos).
- **Automated browsers can't reproduce real captions.** Playwright/CDP trip BotGuard → the
  player's own `pot` request returns empty. You can validate the *plumbing* by routing
  `**/api/timedtext**` to a substituted json3 body; final caption verification needs a real,
  non-automated browser. Age-gated videos (`playabilityStatus: LOGIN_REQUIRED`) need login.
- `chrome-devtools-mcp` launches its own `--disable-extensions` Chrome — useless for testing
  this extension.

## Planning / process

For new features touching these seams (network/pot, real DOM, drag/UX), use the
**`risk-first-planning`** skill and `docs/PLANNING_TEMPLATE.md`: spike the riskiest
real-environment assumption *first*, and define "done" by a real-environment, user-observable
check — not just green tests. See the case study in that doc for why.

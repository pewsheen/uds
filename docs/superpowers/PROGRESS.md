# Build Progress / Handoff — YouTube Dual Subtitles

> **Updated:** 2026-06-07
> **State:** ✅ All 25 tasks complete + fullscreen-remount follow-up. `npm run verify:full` exits 0.
> **HEAD:** `5af34a4` · **Tests:** 53 unit/property/contract + 1 golden + 2 smoke; mutation 96.39% (core, gate 85%) · **Branch:** master (from `git init`)

This project is a greenfield MV3 Chrome extension (two independent, draggable, styleable subtitle boxes on YouTube via `timedtext` + `tlang`) built behind a **rigor harness** so an agent can self-iterate. Architecture: pure `src/core/**` (no `chrome`/`document`/`window`/`fetch`, lint-enforced) + thin `src/adapters/**`.

## Source of truth
- **Spec:** [docs/superpowers/specs/2026-06-07-youtube-dual-subtitles-design.md](specs/2026-06-07-youtube-dual-subtitles-design.md)
- **Plan (25 tasks, full code per task):** [docs/superpowers/plans/2026-06-07-youtube-dual-subtitles.md](plans/2026-06-07-youtube-dual-subtitles.md)
- **Glow UX mockups:** `docs/superpowers/mockups/anchor-glow*.html`

## ✅ Done (Tasks 1–14)
| T | What | Commit |
|---|---|---|
| 1 | Scaffold: package.json, tsconfig (strict), vitest, eslint, inner-loop `verify` | `c491328` |
| 2 | Verified `no-DOM-in-core` lint rule actually fails on DOM use (no commit) | — |
| 3 | `src/core/types.ts` | `8392eff` |
| 4 | `buildTimedTextUrl` | `86e8c55` |
| 5 | `decodeEntities` | `b178f20` |
| 6 | `parseTimedText` | `38ef184` |
| — | **review→fix #1:** uppercase-hex bug, fromCodePoint range guard, `matchAll`, tighter tests | `0beec46` |
| 7 | `selectCue` (+ oracle property) | `422d731` |
| 8 | `tick` reducer | `7a5484f` |
| 9 | `lifecycle` reducer | `e6c84a0` |
| 10 | `resolveAnchor` + `pickVerticalEdge` | `398e3d7` |
| 11 | `geometry` (toFraction/fromFraction/computeBoxRect/clampFraction) | `2434401` |
| 12 | `overlap` (rectsOverlap/avoidOverlap) | `6bf231f` |
| 13 | `styleToCss` | `beceee9` |
| 14 | `decideMountTarget` | `ec62cc3` |
| — | **review→fix #2:** killed mutant-survival gaps (lifecycle guards, anchor/overlap boundaries, vEdge branches, outline:false); honest `TickState.emitted` | `057b721` |

Pure core is mutation-ready. Stryker has **not** been run yet.

## Deviations from the plan already baked in (don't re-litigate)
- `styleToCss` returns a concrete `CssDeclarations` type (not `Record<string,string>`) — required under `noUncheckedIndexedAccess`.
- `clamp01` (in `style.ts`) rounds opacity to 4dp (avoids scientific-notation in `rgba()`).
- `TickState` has an extra `emitted: boolean` flag; `initTick()` returns `{ activeText: null, emitted: false }` (replaced the `undefined as unknown` sentinel). `tick` guards with `state.emitted && …`.
- `parse.ts` uses `xml.matchAll(ROW)` (not a stateful `exec` loop).
- `entities.ts` regex is `/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g`; codepoint guarded to `0..0x10ffff`.
- `.gstack/` is gitignored.

## ✅ Done (Tasks 15–25 + follow-up), subagent-driven (impl → spec review → quality review)
- **T15** `net` adapter + contract `e24238f` · **T16** `storage` + `DEFAULT_SETTINGS` `7664dcd` · **T17** player/renderer/clock `6fc53cc`
- **T18** `content.ts` composition root `8ca6ee3` · **T19** popup UI `c42c7fa` · **T20** MV3 manifest + esbuild `3ae5ec2`
- **T21** Playwright smoke `8b5f42f` — smoke surfaced & fixed 3 REAL bugs: (a) **MAIN-world bridge** (`src/bridge.ts`) — `ytInitialPlayerResponse` is a page global the isolated-world content script can't read, so a `world:"MAIN"` content script republishes it via `data-dual-subs-pr`; (b) renderer `place()` now threads the real `Anchor` (was a broken fx-heuristic clobbered each frame); (c) fixture native `currentTime`. Cleanup `f3b1b0b`.
- **T22** golden `ac582aa` · **T23** Stryker `517499b` (96.39%, +8 mutant-killing tests, 11 genuine equivalents) · **T24** error-paths `cabefe4` · **T25** CI + `docs/DONE.md` `88dd6e6`
- **Follow-up (CEO-requested):** fullscreen remount `5af34a4` — render loop now re-evaluates `decideMountTarget` every frame and `renderer.ensureMount` **moves** the layer (children preserved) into/out of the fullscreen element. 2nd smoke test drives REAL browser fullscreen.

## Real-world dogfood findings (loaded `dist/` into Chromium vs live YouTube)
- ✅ Confirmed working on real `youtube.com`: injection, MAIN-world bridge publish, player-response read, **31 caption tracks discovered**, timedtext URL built, fetch attempted — full pipeline up to the network call.
- ⚠️ **Known robustness gap (NOT yet fixed):** `content.ts main()` awaits `net.fetchText` per box with **no try/catch** — a single failing track (observed HTTP 429 rate-limit from an unauthenticated automated browser; also 404 for a missing lang) throws an **unhandled** rejection and renders nothing. Fix: wrap per-box fetch in try/catch + degrade gracefully (skip that box; optional 429 backoff/retry). Recommend before real use.
- ⚠️ Headless/unauthenticated browsers get bot-gated: age-restricted videos → `playabilityStatus: LOGIN_REQUIRED` (captions stripped); normal videos → timedtext 429. Real testing needs the user's logged-in Chrome (Load unpacked `dist/`).
- Caption discovery relies solely on `ytInitialPlayerResponse...captionTracks`; absent under LOGIN_REQUIRED / could move to the innertube `/youtubei/v1/player` API. Possible future fallback.

## How to resume (subagent-driven execution)
1. Read this file + the plan. Do **not** make subagents read the plan — paste each task's full text + context into the implementer prompt (templates: `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/subagent-driven-development/`).
2. Per task: implementer → **spec-compliance review** → **code-quality review** (hunt mutant-survival gaps) → fix loop → next. Trivial config tasks can use spec-review only.
3. Keep every change behind `npm run verify` (inner loop). Use sonnet for implementers/reviewers.

## Commands
- `npm run verify` — inner loop (tsc + eslint + unit/property/contract). Must stay green.
- `npm run build` — esbuild → `dist/` (needed before smoke).
- `npm run test:smoke` — Playwright (Chromium already installed in this env).
- `npm run test:mutation` — Stryker (core only).
- `npm run verify:full` — everything (verify + golden + mutation + build + smoke).

## Environment notes
- Windows; use the Bash tool for `npm`/`npx`/`git`. Working dir `D:\Codes\uds`.
- Playwright Chromium headless shell already installed (build 1208, Playwright 1.58.x).
- Node + npm on PATH; npm registry reachable.

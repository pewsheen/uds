# Build Progress / Handoff — YouTube Dual Subtitles

> **Updated:** 2026-06-07
> **State:** Tasks 1–14 of 25 complete. Pure core done & hardened. `npm run verify` GREEN.
> **HEAD:** `057b721` · **Tests:** 22 files / 38 passing · **Branch:** default (from `git init`)

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

## ⏳ Remaining (Tasks 15–25) — implement per the plan's exact code
- **T15** `net` adapter + contract test
- **T16** `storage` adapter (+ `DEFAULT_SETTINGS`) + contract test
- **T17** `player` / `renderer` / `clock` adapters (thin; covered by smoke)
- **T18** `content.ts` composition root
- **T19** popup UI (`popup.html` + `popup.ts`)
- **T20** `manifest.json` (MV3) + `build.mjs` (esbuild → `dist/`)
- **T21** Playwright smoke (`playwright.config.ts` + `tests/smoke/fixtures/*` + `extension.spec.ts`)
- **T22** golden test for parser
- **T23** Stryker mutation config + run (core ≥ 85% — this empirically confirms the review→fix hardening)
- **T24** error-path tests
- **T25** CI (`.github/workflows/verify.yml`) + `docs/DONE.md` (Definition of Done + requirement↔test map)

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

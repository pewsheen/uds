# Dual Subtitles

> Two independent, draggable, styleable subtitle tracks on YouTube and Prime Video — pick a language for each, position them anywhere, always on top.

A Manifest V3 Chrome extension that overlays **two** caption tracks on a YouTube video at once (e.g. original + your native language). Each box is independently configurable: its own language, font size, color, background, and on-screen position — and each remembers its place per display mode (default / theater / fullscreen / miniplayer).

Under the hood it's also a **rigor-harness demo**: all decision logic lives in a pure, dependency-free `src/core/` that's exercised by property, golden, and mutation tests, with the browser surface pushed into thin, replaceable adapters. See [Architecture](#architecture).

## Features

- **Two simultaneous subtitle tracks** — each with its own language, drawn from the languages the video actually offers (auto-translated tracks included).
- **Drag to position** — drop a box anywhere; it snaps between *page-anchored* and *video-anchored* with a live glow showing the target, and the two boxes auto-avoid overlapping.
- **Per-mode memory** — positions are saved separately for default, theater, fullscreen, and miniplayer.
- **Per-box styling** — font size, color, background opacity, font family, and text outline.
- **Fullscreen-aware** — the subtitle layer re-parents into/out of the fullscreen element on the fly, preserving its contents.
- **Keep or hide native captions** — optionally leave YouTube's own captions visible alongside your two boxes.
- **Live settings** — changes from the popup apply instantly, no page reload.

## Install (load unpacked)

This extension is not yet published to the Chrome Web Store.

```bash
npm install
npm run build      # bundles to dist/
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder
4. Open any YouTube video, click the extension icon, choose two languages, and enable

> **Note:** YouTube gates caption fetching behind a token only the player can mint and rate-limits unauthenticated requests, so this works best in your normal, logged-in Chrome profile.

## Usage

Click the toolbar icon to open the popup:

- **Enable dual subtitles** — master on/off
- **Also show YouTube's original subtitles** — keep the native caption layer visible
- **Subtitle 1 / Subtitle 2** — pick a language for each box from the video's available tracks
- **Font size** — applies to the boxes

Then on the video, **drag** either box to reposition it. The glow shows whether it will anchor to the page or to the player.

## Architecture

The codebase is split so that all logic is testable without a browser:

```
src/
├── core/        ← pure. Never imports chrome / document / window / fetch (lint-enforced).
│   ├── parse.ts          XML/JSON3 timedtext → Cue[]
│   ├── parse-json3.ts    JSON3 caption parsing
│   ├── entities.ts       HTML entity decoding
│   ├── cue-select.ts     active cue for a timestamp
│   ├── tick.ts           render-on-change reducer
│   ├── lifecycle.ts      state machine (idle → loading → active / error)
│   ├── track-select.ts   match a requested language to an available track
│   ├── anchor.ts         page vs. video anchoring + vertical edge
│   ├── geometry.ts       fraction ↔ pixel, box rect, clamping
│   ├── overlap.ts        rect overlap + auto-avoidance
│   ├── style.ts          StyleSettings → CSS
│   ├── mount.ts          decide mount target for a display mode
│   └── types.ts
├── adapters/    ← thin wiring. No decisions, no branching logic.
│   ├── storage.ts        chrome.storage.sync
│   ├── player.ts         <video>, currentTime, display mode, fullscreen element
│   ├── renderer.ts       draws the overlay layer + drag glow
│   └── clock.ts          requestAnimationFrame
├── content.ts   ← composition root: wires adapters to the core loop
├── bridge.ts    ← MAIN-world script (see below)
├── popup/       ← settings UI
└── manifest.json
```

**The MAIN-world bridge.** `ytInitialPlayerResponse` (which lists caption tracks) and the player's caption fetches are page-world globals an isolated content script can't reach. [`src/bridge.ts`](src/bridge.ts) runs in the `MAIN` world and republishes them to the content script via a DOM attribute and `window.postMessage`.

## Development

```bash
npm run verify        # inner loop: typecheck + lint + unit/property/contract tests
npm run verify:full   # verify + golden + mutation + build + smoke
```

Individual steps:

| Command | What |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint, incl. the `no-DOM-in-core` rule |
| `npm run test:unit` | Vitest — core + adapter contract tests |
| `npm run test:golden` | Parser snapshot test |
| `npm run test:mutation` | Stryker mutation testing (core only, ≥85% gate) |
| `npm run build` | esbuild bundle → `dist/` |
| `npm run test:smoke` | Playwright against a fixed fixture page |

The `core/` purity (no `chrome`/`document`/`window`/`fetch`) is enforced by lint, which keeps the decision logic deterministic and mutation-testable.

## Tech stack

TypeScript · esbuild · Vitest · fast-check (property tests) · Stryker (mutation testing) · Playwright (smoke) · Chrome Manifest V3.

## Status

Early (`v0.0.1`). The full pipeline — injection, track discovery, parsing, rendering, drag, fullscreen remount — is implemented and tested. Known rough edge: per-box caption fetch needs more graceful degradation when a single track is rate-limited or missing.

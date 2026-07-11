# Dual Subtitles

Two independent, draggable, styleable subtitle tracks for YouTube and Prime Video.

Dual Subtitles is a Manifest V3 Chrome extension that renders two caption tracks at
the same time. Each box has its own language, position, font, color, background,
outline, and per-display-mode position.

## Features

- Two simultaneous subtitle tracks from the current video's available languages.
- YouTube and Prime Video provider support.
- Independent dragging with page/video anchoring and overlap avoidance.
- Position memory for default, theater, fullscreen, and miniplayer modes.
- Live popup settings without a page reload.
- Optional native YouTube captions alongside the extension overlays.
- SPA navigation detection so tracks refresh when the site swaps videos.

## Requirements

- Node.js 22 or newer.
- pnpm 11.11.0 (the version pinned in `package.json`).
- Chrome for manual signed-in streaming tests.

Enable the pinned package manager if necessary:

```bash
corepack enable
corepack install
```

## Install the extension

```bash
pnpm install
pnpm build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `dist/` directory.
5. Open a captioned YouTube or Prime Video title and configure both tracks from the
   extension popup.

After rebuilding, select **Reload** on the extension card before retesting.

## Development

Use pnpm consistently; `pnpm-lock.yaml` is the canonical lockfile.

| Command              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm format`        | Format supported project files with Prettier.                         |
| `pnpm format:check`  | Check formatting without changing files.                              |
| `pnpm lint`          | Run ESLint, including core purity checks.                             |
| `pnpm lint:fix`      | Apply safe ESLint fixes.                                              |
| `pnpm typecheck`     | Run strict TypeScript checking.                                       |
| `pnpm test:unit`     | Run core, property, and adapter contract tests.                       |
| `pnpm test:golden`   | Verify approved parser snapshots.                                     |
| `pnpm test:mutation` | Run Stryker; the build fails below an 85% score.                      |
| `pnpm build`         | Bundle the extension into `dist/`.                                    |
| `pnpm test:smoke`    | Run Playwright against deterministic fixture sites.                   |
| `pnpm verify`        | Format check, typecheck, lint, and unit tests.                        |
| `pnpm verify:full`   | Run every deterministic CI check, including mutation and smoke tests. |

For a fast inner loop, run the focused test first and then `pnpm verify`. Before
hand-off, run `pnpm verify:full`.

## Real Chrome testing

Fixture and automated-browser tests cannot prove that the extension works with an
existing signed-in streaming session, ads, DRM playback, or current production DOM.
Agents must follow
[`.agents/skills/real-chrome-streaming-tests/SKILL.md`](.agents/skills/real-chrome-streaming-tests/SKILL.md)
for user-observable checks on both YouTube and Prime Video.

The short version:

1. Build and reload `dist/` in real Chrome.
2. Use the existing Chrome profile; never inspect or export cookies, passwords, or
   session storage.
3. Verify two tracks, cue changes, dragging, display-mode remounting, style updates,
   and same-site navigation.
4. Account for YouTube ads and Prime detail-page preview videos before asserting
   against the active player.
5. Record the tested URL/title, settings, expected result, actual result, and visual
   evidence.

If authentication blocks a requested test, ask the user to sign in in Chrome and say
when it is ready. Do not substitute web search or an automated browser for the
signed-in check.

## Architecture

```text
src/
├── core/        Pure decision logic; no DOM, Chrome API, fetch, or timers.
├── adapters/    Browser wiring for storage, playback, rendering, and clocks.
├── providers/   YouTube and Prime Video discovery/capture integrations.
├── content.ts   Composition root and overlay lifecycle.
├── bridge.ts    Main-world access to player data and caption responses.
├── background.ts
├── popup/
└── manifest.json
```

The `src/core/` boundary is lint-enforced and heavily tested with examples,
properties, golden snapshots, and mutation testing. Browser-specific behavior stays
in adapters/providers so the core remains deterministic.

### Caption delivery

YouTube's player may require proof-of-origin data for timed-text responses. The
main-world bridge captures caption responses made by the player and republishes them
to the isolated content script; a plain fetch of a track URL is not a reliable
replacement.

Prime Video exposes several response shapes and may show a muted preview video on a
detail page. The provider merges partial track records and the player adapter waits
for the visible, loaded playback timeline.

## Project guidance

- [`AGENTS.md`](AGENTS.md) is the repository-wide instruction file for coding agents.
- [`CLAUDE.md`](CLAUDE.md) is the Claude-specific entry point and defers to
  `AGENTS.md`.
- [`docs/PLANNING_TEMPLATE.md`](docs/PLANNING_TEMPLATE.md) is the risk-first planning
  template for changes involving production DOM, streaming network behavior, or UX.

## Status

Early development (`v0.0.1`). The extension, test harness, and live validation
drivers are implemented; streaming sites can still change their DOM and caption
delivery without notice, so real-Chrome verification remains part of release work.

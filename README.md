# UDS

Two independent, draggable, styleable subtitle tracks for YouTube and Prime Video.

UDS is a Manifest V3 Chrome extension that renders two caption tracks at
the same time. Each box has its own language, position, font, color, background,
outline, and per-display-mode position.

## Features

- Two simultaneous subtitle tracks from the current video's available languages.
- YouTube and Prime Video provider support.
- Independent dragging, with player/page anchoring on YouTube, player anchoring on
  Prime Video, and overlap avoidance.
- Position memory for default, theater, fullscreen, and miniplayer modes.
- Live popup settings without a page reload.
- Popup control for original YouTube or Prime Video captions.
- Each player's subtitle state is a master gate: YouTube's CC button or Prime's
  selected subtitle language versus Off. When the gate is on, UDS and original
  captions independently follow their popup toggles. Popup changes never operate the
  player controls, and Prime's combined subtitle/audio menu remains available.
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
5. Open a captioned YouTube or Prime Video title and configure both tracks and the
   original-caption display from the extension popup. The player's subtitle state
   gates both caption systems; when it is on, each system follows its own popup
   toggle.

After rebuilding, select **Reload** on the extension card before retesting.

## Publish to the Chrome Web Store

Release copy, privacy disclosures, asset inventory, and the submission checklist are
collected in [`publish/README.md`](publish/README.md). The detailed store copy is in
[`publish/docs/store-listing.md`](publish/docs/store-listing.md), and the public-facing
privacy policy template is in
[`publish/docs/privacy-policy.md`](publish/docs/privacy-policy.md).

To produce a verified upload ZIP, open the repository's **Actions** tab, select
**prepare store archive**, choose **Run workflow**, and download the resulting
`uds-<version>` artifact. Optionally select **Create a GitHub draft release
and attach the verified ZIP** before running it. The workflow is manual-only and does
not publish to the Chrome Web Store or require store credentials.

For a local package, run `pnpm run pack`. This performs a clean build, validates the
extension file allow-list, and writes `dist/uds-<version>.zip` plus its
`dist/uds-<version>.zip.sha256` checksum.

## Development

Use pnpm consistently; `pnpm-lock.yaml` is the canonical lockfile.

| Command                   | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `pnpm format`             | Format supported project files with Prettier.                         |
| `pnpm format:check`       | Check formatting without changing files.                              |
| `pnpm lint`               | Run ESLint, including core purity checks.                             |
| `pnpm lint:fix`           | Apply safe ESLint fixes.                                              |
| `pnpm typecheck`          | Run strict TypeScript checking.                                       |
| `pnpm test:unit`          | Run core, property, and adapter contract tests.                       |
| `pnpm test:golden`        | Verify approved parser snapshots.                                     |
| `pnpm test:mutation`      | Run Stryker; the build fails below an 85% score.                      |
| `pnpm build`              | Bundle the extension into `dist/`.                                    |
| `pnpm test:smoke`         | Run Playwright against deterministic fixture sites.                   |
| `pnpm run pack`           | Build the validated ZIP and its SHA-256 checksum under `dist/`.       |
| `pnpm test:live`          | Check fullscreen overlay remounting on a live YouTube player.         |
| `pnpm test:live:nav`      | Check caption refresh after live YouTube SPA navigation.              |
| `pnpm test:live:ccon-nav` | Stress repeated live navigation with native captions enabled.         |
| `pnpm verify`             | Format check, typecheck, lint, and unit tests.                        |
| `pnpm verify:full`        | Run every deterministic CI check, including mutation and smoke tests. |

For a fast inner loop, run the focused test first and then `pnpm verify`. Before
hand-off, run `pnpm verify:full`.

### Utility and live-test scripts

`scripts/` contains release/build utilities. Browser-validation drivers live under
`tests/live/`; they launch Playwright Chromium against production YouTube, substitute
caption responses where noted, and write PNG or log evidence under
`test-results/live/`.

| File                                 | Purpose                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `scripts/pack-extension.mjs`         | Build or reuse `dist/`, enforce the Web Store file allow-list, and create the JSZip archive plus `.sha256`. |
| `tests/live/_refresh-ccon.mjs`       | Reproduce the default-on native-caption refresh failure after an empty first caption response.              |
| `tests/live/evidence.mjs`            | Place generated browser-test evidence under `test-results/live/`.                                           |
| `tests/live/fs-remount-chromium.mjs` | Verify that the overlay moves into and out of the fullscreen element on a live player.                      |
| `tests/live/validate-asr.mjs`        | Check YouTube automatic-caption track discovery and `kind=asr` requests.                                    |
| `tests/live/validate-ccon-nav.mjs`   | Stress repeated YouTube SPA navigation while native captions are enabled.                                   |
| `tests/live/validate-dual.mjs`       | Verify sequential loading and rendering of two configured languages.                                        |
| `tests/live/validate-glow.mjs`       | Capture and validate the page-anchor glow during a drag.                                                    |
| `tests/live/validate-nav.mjs`        | Verify bridge refresh and caption reload after YouTube SPA navigation.                                      |
| `tests/live/validate-pipeline.mjs`   | Exercise the live capture-to-parse-to-render pipeline with substituted caption data.                        |

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
for the visible, loaded playback timeline. On both providers, the player's subtitle
state is a transient master gate: Off hides both output systems, while On lets the
UDS and original-caption popup toggles control their outputs independently. Popup
changes never operate the player subtitle controls or rewrite their selected state.
Prime's combined subtitle/audio menu remains available for subtitle selection and
audio controls.

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

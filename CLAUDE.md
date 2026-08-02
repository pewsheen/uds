# CLAUDE.md

Read and follow [`AGENTS.md`](AGENTS.md) before changing this repository. It is the
canonical project instruction file; this document only highlights Claude-specific
entry points and high-cost pitfalls.

## Working loop

1. Use the pinned pnpm toolchain.
2. Add or update the smallest failing test before changing behavior.
3. Run the focused test, then `pnpm verify`.
4. Run `pnpm test:mutation` for changes under `src/core/`.
5. Run `pnpm verify:full` before hand-off.
6. For user-visible streaming behavior, invoke
   [`$real-chrome-streaming-tests`](.agents/skills/real-chrome-streaming-tests/SKILL.md).

Formatting is enforced by `pnpm format:check`; use `pnpm format` to apply the
repository style. Keep the command table and the `scripts/` and `tests/live/`
inventories in `README.md` synchronized with `package.json` and the files on disk.

## Architecture constraints

- Keep `src/core/**` pure. It must not use `chrome`, `document`, `window`,
  `fetch`, or `requestAnimationFrame`, and it must not import adapters.
- Put browser mechanics in `src/adapters/**` and provider-specific discovery in
  `src/providers/**`.
- Treat `src/content.ts` as the composition root and `src/bridge.ts` as privileged
  main-world plumbing.
- Preserve settings compatibility when adding fields; test malformed and legacy
  storage shapes.

## Streaming pitfalls

- Do not fetch YouTube timed-text URLs as if they were ordinary public resources.
  The player may require a proof-of-origin token; the bridge captures the player's
  own responses.
- A YouTube pre-roll ad is a different video. Skip or finish it and wait until the
  requested title and caption tracks are active before asserting.
- Prime detail pages can contain a visible preview separate from the loaded playback
  timeline. Assert against the active, loaded player.
- Original-caption visibility is popup-controlled, but the provider's player
  subtitle state is the master gate: YouTube's CC state or Prime's selected language
  versus Off. UDS output is `player CC && UDS toggle`, and original output is
  `player CC && original toggle`.
- Let trusted player subtitle actions run natively. Never persist them into popup
  preferences, and never let popup toggles click YouTube CC, select a Prime language,
  or choose Prime Off. Keep extension-initiated caption loading unblocked and Prime's
  combined subtitle/audio menu usable.
- Playwright fixture tests and routed timed-text responses validate plumbing, not a
  signed-in production session.
- Chrome may require the unpacked extension to be reloaded after every build.
- Never inspect or export browser cookies, passwords, local storage, or profile data.
  If sign-in is required, ask the user to sign in in Chrome and confirm readiness.

## Planning

Use [`docs/PLANNING_TEMPLATE.md`](docs/PLANNING_TEMPLATE.md) for work that depends on
production DOM, caption network behavior, drag/fullscreen UX, or another fragile
external seam. Prove the riskiest assumption early and define completion with a
user-observable check.

# Repository instructions

These instructions apply to the entire repository.

## Toolchain

- Use pnpm 11.11.0, as pinned by `package.json`.
- Treat `pnpm-lock.yaml` as the canonical lockfile.
- Keep the command table and the `scripts/` and `tests/live/` inventories in
  `README.md` synchronized with `package.json` and the files on disk.
- Run `pnpm format` after editing supported source or documentation files.
- Do not hand-edit generated output under `dist/`, `reports/`, or
  `test-results/`.

## Architecture

- Keep all decisions in `src/core/**` pure and deterministic.
- Never use browser globals, Chrome APIs, network calls, or animation timers in
  `src/core/**`.
- Keep adapters thin; move branching business rules into a tested core function.
- Put site-specific integration in `src/providers/**`.
- Preserve the main-world/isolated-world boundary between `bridge.ts` and
  `content.ts`.
- Maintain backward compatibility for persisted settings.

## Tests

- Write a failing regression test before a behavior fix.
- Run the narrowest relevant Vitest file during iteration.
- Run `pnpm verify` for every code change.
- Run `pnpm test:mutation` whenever `src/core/**` or its tests change. Do not lower
  the 85% breaking threshold to make a change pass.
- Run `pnpm verify:full` before hand-off.
- Keep assertions behavioral. Cover invalid inputs, boundary values, ordering,
  de-duplication, and fallback branches where relevant.

## Browser verification

For production YouTube or Prime Video behavior, use the project skill at
[`.agents/skills/real-chrome-streaming-tests/SKILL.md`](.agents/skills/real-chrome-streaming-tests/SKILL.md).
Follow it after deterministic tests pass.

- Use real Chrome when the task names Chrome or requires the user's existing signed-in
  session.
- For Prime native-caption changes, verify both states: unchecked hides the provider
  overlay, while checked enables a native track and leaves the overlay visible.
- Use the available browser-control skill and read its current instructions before
  interacting with Chrome.
- Do not replace a requested signed-in Chrome check with Playwright, web search, or a
  fixture result.
- Never inspect cookies, passwords, local storage, profile files, or authentication
  tokens.
- When sign-in blocks progress, ask the user to sign in in Chrome and confirm when it
  is ready.

## Documentation

Update `README.md`, `CLAUDE.md`, and this file when commands, architecture,
provider behavior, or test expectations change. Keep detailed real-browser procedure
in the streaming test skill rather than duplicating it across documents.

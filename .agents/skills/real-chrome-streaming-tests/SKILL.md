---
name: real-chrome-streaming-tests
description: Test this unpacked Chrome extension against production YouTube and Prime Video using a real Chrome profile, including signed-in playback, dual captions, navigation, dragging, display modes, and evidence capture. Use when an agent must verify user-visible streaming behavior, reproduce a live-site bug, validate a release, or test behavior that fixtures, Playwright, or substituted caption responses cannot prove.
---

# Test streaming sites in real Chrome

Use real Chrome with the user's existing profile. Treat automated fixture tests as a
prerequisite, not a substitute.

## Prepare

1. Read the available browser-control skill completely before interacting with
   Chrome. Keep its browser-selection, authentication, and privacy rules in force.
2. Run `pnpm verify` and `pnpm build`.
3. Connect to Chrome through the supported browser-control surface. If real Chrome
   control is unavailable, stop and report that limitation; do not silently switch
   to Playwright.
4. Open `chrome://extensions`, enable Developer mode if needed, load `dist/` as an
   unpacked extension, or reload its existing card after a rebuild.
5. Confirm the extension version under test comes from the current workspace.

Do not inspect cookies, passwords, local storage, profile files, or authentication
tokens. If the site requires authentication, ask the user to sign in in Chrome and
tell you when it is ready.

## Choose titles

Select ordinary, publicly discoverable titles that expose at least two caption
languages when possible. Record the title and URL. Avoid purchasing, renting,
subscribing, changing account settings, or starting unrelated content.

For YouTube, expect pre-roll or mid-roll ads. An ad is a separate video with separate
time and track state. Skip it through visible controls when offered, or wait for it
to finish, then confirm the requested title is active.

For Prime Video, distinguish the detail-page preview from the loaded playback
timeline. Do not assert until the intended title's visible player is active.

## Run the shared checks

For each provider:

1. Open the extension popup and enable dual subtitles.
2. Select two distinct available languages.
3. Confirm both overlay boxes appear and their text advances with playback.
4. Confirm each box corresponds to its selected language.
5. Drag each box to a different position and verify the boxes do not overlap.
6. Change font, foreground color, background/opacity, and outline; verify changes
   apply without reloading the page.
7. Enter and exit every mode supported by that provider, including fullscreen and
   theater/miniplayer where available. Verify overlays remain visible and retain
   their per-mode positions.
8. Navigate to another video through the site's own UI without a hard reload.
   Confirm the extension refreshes the video id, track choices, and caption text.
9. Return or navigate again and confirm there are no duplicate overlays, stale cues,
   or detached controls.
10. Inspect only user-visible errors and ordinary developer-console errors needed for
    the test. Do not expose session data in logs or evidence.

## Provider checks

### YouTube

- Verify the native-caption preference both enabled and disabled.
- Confirm caption assertions happen after ads and after the requested video id is
  active.
- Exercise same-tab SPA navigation from a recommendation or search result.
- Verify fullscreen remounting and, when available, theater and miniplayer modes.

### Prime Video

- Confirm track discovery occurs on the playback page, not from a muted preview.
- Verify WebVTT or TTML captions render and advance.
- Exercise a safe in-app navigation such as returning to details and opening another
  included title. Do not buy, rent, subscribe, or alter the account.
- Verify fullscreen remounting and restoration to the normal player.

## Capture evidence

Record:

- provider, title, and URL;
- current commit or working-tree description;
- Chrome and extension version if visible;
- selected languages and style settings;
- each expected result and observed result;
- screenshots of both overlays in normal mode and fullscreen;
- relevant error text with secrets and personal data excluded.

Mark a check blocked when the title lacks two tracks, DRM/playback is unavailable,
authentication requires user action, or Chrome control is unavailable. State the
exact blocker and the last successful check.

## Finish

The live test passes only when both providers complete the shared checks plus their
provider-specific checks, or when the requested task explicitly limits scope to one
provider. Report fixture/smoke results and real-Chrome results separately.

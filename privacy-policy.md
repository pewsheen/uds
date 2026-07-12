# Privacy Policy for UDS

- **Effective date:** 2026/07/13
- **Developer:** pewsheen
- **Contact:** git[_at_]pews.dev

UDS displays two customizable subtitle tracks on supported YouTube and
Prime Video pages. This policy explains the data handled for that single purpose.

## Data handled

On a supported video page, the extension processes on the user's device:

- The current supported page URL and video identifier, to associate captions with the
  current video and refresh them after navigation.
- Caption-track metadata and subtitle text supplied by YouTube or Prime Video, to
  display the languages the user selects.
- Extension settings: enabled state, languages, styles, and overlay positions.

UDS does not collect names, email addresses, credentials, payment or health
information, personal communications, precise location, or form entries. It includes
no analytics, advertising, or tracking.

## Use and transfer

Page and caption data is processed only to discover tracks, fetch or observe selected
captions, reject captions from another video, and render overlays. The extension does
not build a browsing history or user profile.

Settings use `chrome.storage.sync` so they persist and may follow the user between
Chrome installations when Chrome Sync is enabled. Chrome Sync is operated by Google
under the user's account settings.

The extension may request a selected Prime Video subtitle file over HTTPS from
`cf-timedtext.aux.pv-cdn.net`, a Prime Video caption-delivery host. YouTube caption
responses are observed within the YouTube page. Caption text, URLs, settings, and usage
information are not sent to developer-operated servers.

The developer does not receive, sell, rent, share, or use handled data for advertising,
creditworthiness, lending, or an unrelated purpose. No developer employee or
contractor is given access to page, caption, or settings data.

The extension's use of information is limited to its disclosed single purpose and
complies with the Chrome Web Store User Data Policy, including Limited Use
requirements.

## Retention and deletion

Caption data and current page/video identifiers remain only in extension/page memory
for the active session. A small in-memory buffer of recent caption responses supports
initialization and is cleared when the page closes or reloads.

Settings remain in Chrome Sync until the user changes them, clears extension data, or
uninstalls the extension. Users manage this data through Chrome's extension and sync
controls.

## Security

Extension network requests use HTTPS. The Prime Video background caption request is
restricted to the exact approved caption hostname. The extension executes no remotely
hosted code.

## Changes and contact

If handling practices change, this policy and Chrome Web Store disclosures will be
updated, with a prominent user notice when required.

Questions or privacy requests: git[_at_]pews.dev

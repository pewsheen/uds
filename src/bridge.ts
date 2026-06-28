// Runs in the page's MAIN world (manifest "world": "MAIN"). Three jobs:
//  1. Copy `ytInitialPlayerResponse` into a DOM attribute (the isolated-world content
//     script can't read page globals).
//  2. Intercept the player's caption (timedtext) responses and forward their text to
//     the content script. YouTube gates timedtext with a `pot` proof-of-origin token
//     that only the player can mint, so the isolated world can't fetch captions
//     itself — we reuse what the player already fetched.
//  3. On request, ask the player to load a specific caption language (which triggers
//     an authenticated fetch we then forward).
import { parseWatchId } from './core/navigation'

const ATTR = 'data-dual-subs-pr'
const dlog = (...a: unknown[]) => { try { if (localStorage.getItem('dualSubsDebug') === '1') console.log('[uds.bridge]', ...a) } catch { /* debug only */ } }

type PlayerResp = { videoDetails?: { videoId?: string } } | undefined

// The current video's player response. After an SPA navigation `ytInitialPlayerResponse`
// is NOT reliably updated, so prefer the live player API, which always reflects the
// video on screen; fall back to the initial global for the very first page load.
function currentPlayerResponse(): PlayerResp {
  const mp = document.getElementById('movie_player') as unknown as { getPlayerResponse?: () => unknown } | null
  const fromApi = mp?.getPlayerResponse?.()
  return (fromApi ?? (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse) as PlayerResp
}

function publishFrom(pr: PlayerResp): boolean {
  if (!pr) return false
  try {
    document.documentElement.setAttribute(ATTR, JSON.stringify(pr))
    return true
  } catch {
    return false
  }
}

// Publish the response for `wantId` (the video in the URL), retrying until the player
// API catches up. We only write once the response's videoId matches so the content
// script never reads the previous video's tracks during the swap.
function publishCurrent(wantId: string | null): void {
  let tries = 0
  const attempt = () => {
    tries += 1
    const pr = currentPlayerResponse()
    // Reject only a response that carries a DIFFERENT videoId (the player API still on
    // the old video mid-swap). A response without a videoId is accepted best-effort.
    const id = pr?.videoDetails?.videoId
    const stale = !!wantId && !!id && id !== wantId
    if (pr && !stale) {
      publishFrom(pr)
      return
    }
    if (tries <= 100) setTimeout(attempt, 50)
  }
  attempt()
}

publishCurrent(parseWatchId(location.href))

const TIMEDTEXT = '/api/timedtext'
type CaptionMsg = { __dualSubsCaption: true; url: string; body: string }
const buffer: CaptionMsg[] = []

function forward(url: string, body: string): void {
  if (!body || !url.includes(TIMEDTEXT)) return
  const msg: CaptionMsg = { __dualSubsCaption: true, url, body }
  buffer.push(msg)
  if (buffer.length > 12) buffer.shift() // bound it; recent captures are what a replay needs
  try { const u = new URL(url); dlog('forward lang', u.searchParams.get('lang') || u.searchParams.get('tlang'), 'kind', u.searchParams.get('kind'), 'len', body.length, 'buf', buffer.length) } catch { /* debug only */ }
  window.postMessage(msg, '*')
}

// On SPA navigation, re-publish the new video's player response (its tracks). The
// captured-caption buffer is intentionally NOT cleared here — see the note inside.
document.addEventListener('yt-navigate-finish', () => {
  // Do NOT wipe the buffer here. The player often fetches the NEW video's captions a
  // beat BEFORE this event fires; wiping dropped that capture, and since the player
  // won't re-fetch an already-loaded track, the box stayed empty until a manual CC
  // toggle. The content script filters captures by video id (the `v` in the timedtext
  // URL), so a retained old-video capture can't leak into the new video — it's just
  // ignored. Keep the buffer; only re-publish the new video's player response.
  dlog('nav-finish: republish wantId', parseWatchId(location.href), 'buf', buffer.length)
  publishCurrent(parseWatchId(location.href))
})

const origFetch = window.fetch
window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
  const p = origFetch.apply(window, [input, init])
  if (url.includes(TIMEDTEXT)) {
    void p.then((res) => { void res.clone().text().then((t) => forward(url, t)).catch(() => {}) }).catch(() => {})
  }
  return p
}

const origOpen = XMLHttpRequest.prototype.open
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
  const u = String(url)
  if (u.includes(TIMEDTEXT)) this.addEventListener('load', () => forward(u, this.responseText))
  ;(origOpen as (...a: unknown[]) => void).apply(this, [method, url, ...rest])
} as XMLHttpRequest['open']

type YtPlayer = {
  loadModule?: (m: string) => void
  setOption?: (module: string, option: string, value: unknown) => void
  getOption?: (module: string, option: string, args?: unknown) => unknown
}

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window || !e.data) return
  const data = e.data as { __dualSubsReady?: boolean; __dualSubsLoad?: { languageCode?: string; asr?: boolean } }
  if (data.__dualSubsReady) {
    dlog('replay', buffer.length, 'buffered msg(s)')
    for (const m of buffer) window.postMessage(m, '*') // replay captures the content script missed
    return
  }
  const req = data.__dualSubsLoad
  if (!req || !req.languageCode) return
  const p = document.getElementById('movie_player') as unknown as YtPlayer | null
  if (!p) return
  try {
    p.loadModule?.('captions')
    // Resolve the track from the CURRENT video's response (getPlayerResponse, already
    // fresh) in preference to getOption('captions','tracklist'): right after an SPA nav
    // the latter lags a beat and can still name the PREVIOUS video's track, so setOption-
    // ing it makes the player fetch the wrong video — the box then stays empty until a
    // manual CC toggle. The response captionTracks are the same objects the player builds
    // its tracklist from, so setOption accepts them. Fall back to getOption.
    const resp = currentPlayerResponse() as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { languageCode?: string; kind?: string }[] } } } | undefined
    const respTracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    const list = ((respTracks && respTracks.length ? respTracks : p.getOption?.('captions', 'tracklist', { includeAsr: true })) ?? []) as { languageCode?: string; kind?: string }[]
    const lc = req.languageCode
    const primary = lc.split('-')[0]
    const track = list.find((t) => t.languageCode === lc && (t.kind === 'asr') === !!req.asr) // exact lang + kind
      ?? list.find((t) => t.languageCode === lc)
      ?? list.find((t) => (t.languageCode ?? '').split('-')[0] === primary)
      ?? list[0]
    dlog('load req', req.languageCode, 'asr', !!req.asr, 'src', respTracks && respTracks.length ? 'resp' : 'getOption', 'list', list.length, 'chose', (track as { languageCode?: string } | undefined)?.languageCode, 'setOption', !!track)
    if (track) p.setOption?.('captions', 'track', track)
  } catch { /* the player API shape varies across YouTube versions; best effort */ }
})

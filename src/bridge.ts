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
  window.postMessage(msg, '*')
}

// On SPA navigation: drop the previous video's captured captions (so a replay can't
// hand them to the new video) and re-publish the new video's player response.
document.addEventListener('yt-navigate-finish', () => {
  buffer.length = 0
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
    for (const m of buffer) window.postMessage(m, '*') // replay captures the content script missed
    return
  }
  const req = data.__dualSubsLoad
  if (!req || !req.languageCode) return
  const p = document.getElementById('movie_player') as unknown as YtPlayer | null
  if (!p) return
  try {
    p.loadModule?.('captions')
    const list = (p.getOption?.('captions', 'tracklist', { includeAsr: true }) ?? []) as { languageCode?: string; kind?: string }[]
    const lc = req.languageCode
    const primary = lc.split('-')[0]
    const track = list.find((t) => t.languageCode === lc && (t.kind === 'asr') === !!req.asr) // exact lang + kind
      ?? list.find((t) => t.languageCode === lc)
      ?? list.find((t) => (t.languageCode ?? '').split('-')[0] === primary)
      ?? list[0]
    if (track) p.setOption?.('captions', 'track', track)
  } catch { /* the player API shape varies across YouTube versions; best effort */ }
})

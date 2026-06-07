// Runs in the page's MAIN world (manifest "world": "MAIN"). Three jobs:
//  1. Copy `ytInitialPlayerResponse` into a DOM attribute (the isolated-world content
//     script can't read page globals).
//  2. Intercept the player's caption (timedtext) responses and forward their text to
//     the content script. YouTube gates timedtext with a `pot` proof-of-origin token
//     that only the player can mint, so the isolated world can't fetch captions
//     itself — we reuse what the player already fetched.
//  3. On request, ask the player to load a specific caption language (which triggers
//     an authenticated fetch we then forward).
const ATTR = 'data-dual-subs-pr'

function publish(): boolean {
  const pr = (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse
  if (!pr) return false
  try {
    document.documentElement.setAttribute(ATTR, JSON.stringify(pr))
    return true
  } catch {
    return false
  }
}

if (!publish()) {
  let tries = 0
  const id = setInterval(() => {
    tries += 1
    if (publish() || tries > 100) clearInterval(id)
  }, 50)
}

const TIMEDTEXT = '/api/timedtext'
type CaptionMsg = { __dualSubsCaption: true; url: string; body: string }
const buffer: CaptionMsg[] = []

function forward(url: string, body: string): void {
  if (!body || !url.includes(TIMEDTEXT)) return
  const msg: CaptionMsg = { __dualSubsCaption: true, url, body }
  buffer.push(msg)
  window.postMessage(msg, '*')
}

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
  const data = e.data as { __dualSubsReady?: boolean; __dualSubsLoad?: string }
  if (data.__dualSubsReady) {
    for (const m of buffer) window.postMessage(m, '*') // replay captures the content script missed
    return
  }
  const lang = data.__dualSubsLoad
  if (!lang) return
  const p = document.getElementById('movie_player') as unknown as YtPlayer | null
  if (!p) return
  try {
    p.loadModule?.('captions')
    const list = (p.getOption?.('captions', 'tracklist', { includeAsr: true }) ?? []) as { languageCode?: string }[]
    const primary = lang.split('-')[0]
    const track = list.find((t) => t.languageCode === lang)
      ?? list.find((t) => (t.languageCode ?? '').split('-')[0] === primary)
      ?? list[0]
    if (track) p.setOption?.('captions', 'track', track)
  } catch { /* the player API shape varies across YouTube versions; best effort */ }
})

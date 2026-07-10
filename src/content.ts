import type { Anchor, BoxConfig, CaptionTrack, Cue, DisplayMode, Fraction, Rect, Settings, VEdge } from './core/types'
import { initTick, tick } from './core/tick'
import { resolveAnchor } from './core/anchor'
import { toFraction, clampFraction, computeBoxRect } from './core/geometry'
import { avoidOverlap } from './core/overlap'
import { styleToCss } from './core/style'
import { decideMountTarget } from './core/mount'
import { pickTrack, captureMatchesBox } from './core/track-select'
import { parseCaptions } from './core/parse'
import { parseWatchId, videoChanged } from './core/navigation'
import { createStorageAdapter } from './adapters/storage'
import { createPlayerAdapter } from './adapters/player'
import { createRenderer, type BoxView } from './adapters/renderer'

type CaptionTrackRaw = { baseUrl: string; languageCode: string; name?: { simpleText?: string }; kind?: string }
type PlayerResponse =
  | {
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrackRaw[] } }
      videoDetails?: { videoId?: string }
    }
  | undefined

function tracksFromResponse(pr: PlayerResponse): CaptionTrack[] {
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return (tracks ?? []).map((t) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, name: t.name?.simpleText, kind: t.kind }))
}

// `ytInitialPlayerResponse` is a page (main-world) global. A content script runs in an
// isolated world and cannot read it directly. The MAIN-world bridge content script
// copies it into this DOM attribute for us to read.
const BRIDGE_ATTR = 'data-dual-subs-pr'
const dlog = (...a: unknown[]) => { try { if (localStorage.getItem('dualSubsDebug') === '1') console.log('[uds.content]', ...a) } catch { /* debug only */ } }

function readBridgeResponse(): PlayerResponse {
  const raw = document.documentElement.getAttribute(BRIDGE_ATTR)
  if (!raw) return undefined
  try { return JSON.parse(raw) as PlayerResponse } catch { return undefined }
}

// Resolve the published response into tracks for a *specific* video, defeating the
// stale-read race after an SPA navigation: until the bridge re-publishes the new
// video's response (stamped with its videoId), we keep waiting instead of returning
// the previous video's tracks. `null` means "not ready yet"; `[]` means "this video
// genuinely has no captions" (response matched but carried no tracks).
function currentTracks(expectId: string | null): CaptionTrack[] | null {
  const pr = readBridgeResponse()
  const id = pr?.videoDetails?.videoId
  if (expectId && id && id !== expectId) return null // bridge still on the old video
  const tracks = tracksFromResponse(pr)
  if (tracks.length > 0) return tracks
  return expectId && id === expectId ? [] : null // definitively empty only once the id matches
}

async function findTracksFor(expectId: string | null, attempts = 100): Promise<CaptionTrack[]> {
  for (let i = 0; i < attempts; i++) {
    const tracks = currentTracks(expectId)
    if (tracks !== null) return tracks
    await new Promise((r) => setTimeout(r, 50))
  }
  return []
}

async function main() {
  const store = createStorageAdapter(chrome.storage.sync)
  const player = createPlayerAdapter()
  const renderer = createRenderer()

  // Let the popup discover which caption languages this video offers. Gate on the
  // current video id so an SPA navigation can't serve the previous video's list.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg as { type?: string }).type !== 'dual-subs:getTracks') return
    void (async () => {
      const tracks = await findTracksFor(parseWatchId(location.href), 40)
      sendResponse(tracks.map((t) => ({ languageCode: t.languageCode, name: t.name, kind: t.kind })))
    })()
    return true
  })

  const settings: Settings = await store.load()
  // `tracks` is the CURRENT video's caption tracks. It is refreshed on every supported
  // site navigation, so it must be mutable and outlive any single video -- the
  // caption listener and loader both read it.
  let tracks: CaptionTrack[] = []

  const cuesByBox: Record<string, Cue[]> = {}
  const views: Record<string, BoxView> = {}
  const tickStates: Record<string, ReturnType<typeof initTick>> = {}
  let draggingId: string | null = null

  const viewportRect = (): Rect => ({ x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight })
  // Page-anchored boxes are positioned relative to the viewport; video-anchored ones
  // relative to the player. Drag AND render must agree on this, or boxes snap back.
  const refBoxFor = (anchor: Anchor): Rect => (anchor === 'video' ? player.playerRect() : viewportRect())
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const initialMode: DisplayMode = player.displayMode()
  for (const box of settings.boxes) {
    const target = decideMountTarget(initialMode, player.fullscreenEl() !== null)
    const view = renderer.createBox(target, player.fullscreenEl(), box.id)
    view.setStyle(styleToCss(box.style))
    views[box.id] = view
    tickStates[box.id] = initTick()
    cuesByBox[box.id] = []
    attachDrag(box, view)
  }

  // Cues come from provider caption responses, forwarded by the MAIN-world bridge.
  // YouTube is captured from the native player; Prime can also be fetched directly
  // from signed subtitle URLs discovered in its playback metadata.
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return
    const d = e.data as { __dualSubsCaption?: boolean; url?: string; body?: string; languageCode?: string; videoId?: string | null; asr?: boolean } | null
    if (!d || d.__dualSubsCaption !== true || !d.url || !d.body) return
    let capLang = (d.languageCode ?? '').toLowerCase()
    let capAsr = d.asr === true
    let capV: string | null = d.videoId ?? null
    try {
      const u = new URL(d.url)
      capLang ||= (u.searchParams.get('lang') || u.searchParams.get('tlang') || '').toLowerCase()
      capAsr ||= u.searchParams.get('kind') === 'asr'
      capV ??= u.searchParams.get('v')
    } catch { /* opaque provider URL; bridge metadata may still identify it */ }
    if (!capLang) { dlog('caption missing language', d.url); return }
    // Only accept captions for the video on screen NOW. Providers may prefetch adjacent
    // titles, and a capture can surface mid-SPA-swap. The bridge includes a provider id
    // when URLs do not carry one, so this guard still blocks stale captions.
    const curV = parseWatchId(location.href)
    if (capV && curV && capV !== curV) { dlog('caption v', capV, '!=', curV, 'skip'); return }
    const cues = parseCaptions(d.body)
    if (cues.length === 0) return
    // Assign to the box whose resolved track matches this captured one (language + asr).
    let matched = false
    for (const box of settings.boxes) {
      const want = pickTrack(tracks, box.lang)
      if (want && captureMatchesBox(box.lang, want, capLang, capAsr)) {
        cuesByBox[box.id] = cues
        matched = true
      }
    }
    dlog('caption capLang', capLang, 'asr', capAsr, 'cues', cues.length, matched ? 'ASSIGNED' : 'DROPPED', '| tracks', tracks.map((t) => t.languageCode), 'boxLangs', settings.boxes.map((b) => b.lang))
  })
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return
    const d = e.data as { __dualSubsFetchViaExtension?: boolean; url?: string; languageCode?: string; videoId?: string | null; asr?: boolean } | null
    if (!d?.__dualSubsFetchViaExtension || !d.url) return
    void (async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'dual-subs:fetchCaption', url: d.url }) as { ok?: boolean; body?: string; error?: string; status?: number } | undefined
        if (!res?.ok || !res.body) {
          dlog('extension fetch failed', d.url, res?.status ?? '', res?.error ?? '')
          return
        }
        window.postMessage({
          __dualSubsCaption: true,
          url: d.url,
          body: res.body,
          languageCode: d.languageCode,
          videoId: d.videoId,
          asr: d.asr,
        }, '*')
      } catch (error) {
        dlog('extension fetch threw', d.url, String(error))
      }
    })()
  })
  // NOTE: the replay request (`__dualSubsReady`) is issued from loadVideo() AFTER the
  // current video's `tracks` are known — replaying earlier would match captured cues
  // against an empty track list and silently drop them.

  // Hide the provider's own caption text so it doesn't overlap our boxes -- only while enabled.
  const hideNative = document.createElement('style')
  hideNative.textContent = '.ytp-caption-window-container, .caption-window, [class*="textTrack" i] { display: none !important; }'
  function setNativeHidden(hidden: boolean) {
    if (hidden && !hideNative.isConnected) document.documentElement.appendChild(hideNative)
    else if (!hidden && hideNative.isConnected) hideNative.remove()
  }

  function render() {
    const fsEl = player.fullscreenEl()
    renderer.ensureMount(decideMountTarget(player.displayMode(), fsEl !== null), fsEl)
    const t = player.currentTime()
    for (const box of settings.boxes) {
      const res = tick(tickStates[box.id]!, t, cuesByBox[box.id] ?? [])
      tickStates[box.id] = res.state
      if (res.renderCommand) views[box.id]!.setText(res.renderCommand.text)
      if (draggingId !== box.id) {
        const place = box.posByMode[player.displayMode()]
        views[box.id]!.place({ fx: place.fx, fy: place.fy }, refBoxFor(place.anchor), place.vEdge, place.anchor)
      }
    }
    requestAnimationFrame(render)
  }
  requestAnimationFrame(render)

  // Load captions one language at a time: the player only fetches one track at once,
  // so requesting both simultaneously loses one. Retry until each box has cues.
  let loadGen = 0
  function clickCCifOff() {
    const btn = document.querySelector<HTMLElement>('.ytp-subtitles-button')
    if (btn && btn.getAttribute('aria-pressed') === 'false') btn.click()
  }
  async function toggleCCForRefetch(gen: number): Promise<boolean> {
    const btn = document.querySelector<HTMLElement>('.ytp-subtitles-button')
    if (!btn || btn.getAttribute('aria-pressed') !== 'true') return false
    dlog('startLoading gen', gen, 'nudge → cc toggle')
    btn.click()
    await sleep(600)
    if (gen !== loadGen || !settings.enabled) return false
    btn.click()
    await sleep(1600)
    return true
  }
  const isStuck = () => settings.boxes.some((b) => pickTrack(tracks, b.lang) && (cuesByBox[b.id]?.length ?? 0) === 0)
  async function startLoading() {
    const gen = ++loadGen
    let nudged = false
    dlog('startLoading gen', gen, 'ccPressed', document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed'))
    for (let round = 0; round < 10 && gen === loadGen && settings.enabled; round++) {
      clickCCifOff()
      let pending = false
      for (const box of settings.boxes) {
        if (gen !== loadGen || !settings.enabled) return
        const want = pickTrack(tracks, box.lang)
        if (!want) continue
        if ((cuesByBox[box.id]?.length ?? 0) > 0) continue
        pending = true
        // bridge → player.setOption(track); send the resolved track (incl. asr kind).
        dlog('startLoading gen', gen, 'round', round, box.id, 'post-load', want.languageCode, want.kind === 'asr' ? 'asr' : '')
        window.postMessage({ __dualSubsLoad: { languageCode: want.languageCode, asr: want.kind === 'asr' } }, '*')
        await sleep(1600) // let the player switch + fetch + bridge capture
      }
      if (!pending) break
      // A wanted box is still empty after a full round — the player likely has an empty/
      // stale track loaded and ignores setOption for it (e.g. its first pot-gated fetch
      // came back empty while captions were default-on). Dislodge it by switching to a
      // DIFFERENT track when possible; if the video/settings expose no alternate, fall
      // back to the same CC off→on refetch a manual user toggle would trigger.
      if (!nudged && gen === loadGen && isStuck()) {
        nudged = true
        const wanted = new Set(settings.boxes.map((b) => pickTrack(tracks, b.lang)?.languageCode).filter(Boolean))
        const other = tracks.find((t) => !wanted.has(t.languageCode)) ?? tracks.find((t) => t.kind === 'asr' && wanted.has(t.languageCode))
        if (other) {
          dlog('startLoading gen', gen, 'nudge →', other.languageCode, other.kind ?? '')
          window.postMessage({ __dualSubsLoad: { languageCode: other.languageCode, asr: other.kind === 'asr' } }, '*')
          await sleep(1600) // let the player switch away, so the next round's re-select re-fetches
        } else {
          await toggleCCForRefetch(gen)
        }
      }
      await sleep(500)
    }
    dlog('startLoading gen', gen, 'exit cues', settings.boxes.map((b) => cuesByBox[b.id]?.length ?? 0))
  }

  // Apply popup changes live, no page refresh needed.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes['dualSubsSettings']) return
    const next = changes['dualSubsSettings'].newValue as Settings | undefined
    if (next) applySettings(next)
  })
  function applySettings(next: Settings) {
    settings.enabled = next.enabled
    settings.nativeSubtitles = next.nativeSubtitles
    let langChanged = false
    next.boxes.forEach((nb, i) => {
      const box = settings.boxes[i]!
      if (box.lang !== nb.lang) { box.lang = nb.lang; cuesByBox[box.id] = []; langChanged = true } // re-fetch new language
      box.style = nb.style
      views[box.id]!.setStyle(styleToCss(nb.style))
    })
    if (!settings.enabled) {
      loadGen++ // cancel in-flight loading
      for (const box of settings.boxes) cuesByBox[box.id] = []
      setNativeHidden(false)
    } else {
      setNativeHidden(!settings.nativeSubtitles) // keep native provider captions if the user opted in
      // A language change just cleared that box's cues. The player may already have the
      // track loaded, so startLoading's setOption won't trigger a fresh fetch — but the
      // bridge still has the capture buffered, so ask it to replay; captureMatchesBox
      // re-routes it to the now-correct box. Without this, re-selecting a source the
      // player already loaded (e.g. off→on, or A→B→A) leaves the box empty.
      if (langChanged) window.postMessage({ __dualSubsReady: true }, '*')
      void startLoading()
    }
  }

  // Per-video (re)initialization. Runs on first load and again on every SPA
  // navigation to a new video. `navGen` discards a load whose video was superseded
  // by a newer navigation before its tracks finished resolving.
  let navGen = 0
  let currentVideoId: string | null = parseWatchId(location.href)
  async function loadVideo() {
    const myNav = ++navGen
    loadGen++ // cancel any caption loading still in flight for the previous video
    dlog('loadVideo nav#', myNav, 'videoId', currentVideoId)
    for (const box of settings.boxes) {
      cuesByBox[box.id] = []
      tickStates[box.id] = initTick() // reset cue cursor so the old video's text can't linger
    }
    const fresh = await findTracksFor(currentVideoId)
    if (myNav !== navGen) { dlog('loadVideo nav#', myNav, 'superseded'); return } // a newer navigation took over while we waited
    tracks = fresh
    dlog('loadVideo nav#', myNav, 'tracks', tracks.map((t) => t.languageCode + (t.kind === 'asr' ? ':asr' : '')))
    // Now that tracks are known, ask the bridge to replay any caption responses it
    // captured before we were ready to match them (initial load + post-navigation).
    window.postMessage({ __dualSubsReady: true }, '*')
    if (settings.enabled) {
      setNativeHidden(!settings.nativeSubtitles)
      void startLoading()
    }
  }

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return
    const d = e.data as { __dualSubsTracksChanged?: boolean } | null
    if (d?.__dualSubsTracksChanged) {
      currentVideoId = parseWatchId(location.href)
      if (currentVideoId) void loadVideo()
    }
  })

  // Supported sites can swap videos without a document reload. Detect YouTube's own
  // router event when available, plus a cheap URL poll that also covers Prime Video.
  function onMaybeNavigated() {
    const next = parseWatchId(location.href)
    const changed = videoChanged(currentVideoId, next)
    currentVideoId = next
    if (changed) void loadVideo()
  }
  document.addEventListener('yt-navigate-finish', onMaybeNavigated)
  setInterval(onMaybeNavigated, 1000)

  if (currentVideoId) void loadVideo()

  function attachDrag(box: BoxConfig, view: BoxView) {
    // Swallow pointer/click events so they never reach YouTube's player (otherwise a
    // drag that starts on our box can scrub/pause the video instead).
    view.el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      draggingId = box.id
      view.el.setPointerCapture(e.pointerId)
    })
    view.el.addEventListener('click', (e) => { e.stopPropagation() })
    view.el.addEventListener('pointermove', (e) => {
      if (draggingId !== box.id) return
      e.preventDefault()
      e.stopPropagation()
      const point = { x: e.clientX, y: e.clientY }
      const anchor = resolveAnchor(point, player.playerRect())
      const refBox = refBoxFor(anchor)
      let f: Fraction = toFraction(point, refBox)
      // vEdge hysteresis: only flip top/bottom outside a deadband around the midline,
      // so a box dragged near vertical-center doesn't jump by its own height each frame.
      const cur = box.posByMode[player.displayMode()].vEdge
      const vEdge: VEdge = f.fy < 0.45 ? 'top' : f.fy > 0.55 ? 'bottom' : cur
      const size = view.measure()
      const vp = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
      f = clampFraction(f, refBox, size, vEdge, vp, 8)
      view.place(f, refBox, vEdge, anchor)
      renderer.showGlow(refBox) // highlight the anchor target (video vs page)
      stash(box, anchor, vEdge, f)
    })
    const end = () => {
      if (draggingId !== box.id) return
      draggingId = null
      renderer.hideGlow()
      void (async () => {
        const me = box.posByMode[player.displayMode()]
        const other = settings.boxes.find((b) => b.id !== box.id)!
        const otherPlace = other.posByMode[player.displayMode()]
        if (me.anchor === otherPlace.anchor) {
          const ref = refBoxFor(me.anchor)
          const myRect = computeBoxRect({ fx: me.fx, fy: me.fy }, ref, view.measure(), me.vEdge)
          const otherRect = computeBoxRect({ fx: otherPlace.fx, fy: otherPlace.fy }, ref, views[other.id]!.measure(), otherPlace.vEdge)
          const cleared = avoidOverlap(myRect, [otherRect], 8)
          me.fy = toFraction({ x: cleared.x + cleared.width / 2, y: me.vEdge === 'top' ? cleared.y : cleared.y + cleared.height }, ref).fy
        }
        await store.save(settings)
      })()
    }
    view.el.addEventListener('pointerup', end)
    view.el.addEventListener('pointercancel', end)
  }

  function stash(box: BoxConfig, anchor: Anchor, vEdge: VEdge, f: Fraction) {
    box.posByMode[player.displayMode()] = { anchor, vEdge, fx: f.fx, fy: f.fy }
  }
}

void main()




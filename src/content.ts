import type { Anchor, BoxConfig, CaptionTrack, Cue, DisplayMode, Fraction, Rect, Settings, VEdge } from './core/types'
import { initTick, tick } from './core/tick'
import { resolveAnchor } from './core/anchor'
import { toFraction, clampFraction, computeBoxRect } from './core/geometry'
import { avoidOverlap } from './core/overlap'
import { styleToCss } from './core/style'
import { decideMountTarget } from './core/mount'
import { pickTrack } from './core/track-select'
import { parseCaptions } from './core/parse'
import { createStorageAdapter } from './adapters/storage'
import { createPlayerAdapter } from './adapters/player'
import { createRenderer, type BoxView } from './adapters/renderer'

type CaptionTrackRaw = { baseUrl: string; languageCode: string; name?: { simpleText?: string } }
type PlayerResponse =
  | { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrackRaw[] } } }
  | undefined

function tracksFromResponse(pr: PlayerResponse): CaptionTrack[] {
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return (tracks ?? []).map((t) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, name: t.name?.simpleText }))
}

// `ytInitialPlayerResponse` is a page (main-world) global. A content script runs in an
// isolated world and cannot read it directly. The MAIN-world bridge content script
// copies it into this DOM attribute for us to read.
const BRIDGE_ATTR = 'data-dual-subs-pr'

function readBridgeResponse(): PlayerResponse {
  const raw = document.documentElement.getAttribute(BRIDGE_ATTR)
  if (!raw) return undefined
  try { return JSON.parse(raw) as PlayerResponse } catch { return undefined }
}

async function findTracks(): Promise<CaptionTrack[]> {
  for (let i = 0; i < 100; i++) {
    const tracks = tracksFromResponse(readBridgeResponse())
    if (tracks.length > 0) return tracks
    await new Promise((r) => setTimeout(r, 50))
  }
  return []
}

async function main() {
  const store = createStorageAdapter(chrome.storage.sync)
  const player = createPlayerAdapter()
  const renderer = createRenderer()

  // Let the popup discover which caption languages this video offers.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg as { type?: string }).type !== 'dual-subs:getTracks') return
    void (async () => {
      for (let i = 0; i < 40; i++) {
        const tracks = tracksFromResponse(readBridgeResponse())
        if (tracks.length > 0) {
          sendResponse(tracks.map((t) => ({ languageCode: t.languageCode, name: t.name })))
          return
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      sendResponse([])
    })()
    return true
  })

  const settings: Settings = await store.load()
  const tracks = await findTracks()
  if (tracks.length === 0) return // video has no captions → nothing to mount

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

  // Cues come from the player's OWN caption responses, forwarded by the MAIN-world
  // bridge (YouTube gates timedtext with a `pot` token only the player can mint).
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return
    const d = e.data as { __dualSubsCaption?: boolean; url?: string; body?: string } | null
    if (!d || d.__dualSubsCaption !== true || !d.url || !d.body) return
    let lang = ''
    try {
      const u = new URL(d.url)
      lang = u.searchParams.get('tlang') || u.searchParams.get('lang') || ''
    } catch { return }
    const cues = parseCaptions(d.body)
    if (cues.length === 0) return
    for (const box of settings.boxes) {
      if (pickTrack([{ baseUrl: d.url, languageCode: lang }], box.lang)) cuesByBox[box.id] = cues
    }
  })
  window.postMessage({ __dualSubsReady: true }, '*') // replay anything fetched pre-listener

  // Hide YouTube's own caption text so it doesn't overlap our boxes — only while enabled.
  const hideNative = document.createElement('style')
  hideNative.textContent = '.ytp-caption-window-container, .caption-window { display: none !important; }'
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
  async function startLoading() {
    const gen = ++loadGen
    for (let round = 0; round < 10 && gen === loadGen && settings.enabled; round++) {
      clickCCifOff()
      let pending = false
      for (const box of settings.boxes) {
        if (gen !== loadGen || !settings.enabled) return
        if (!pickTrack(tracks, box.lang)) continue
        if ((cuesByBox[box.id]?.length ?? 0) > 0) continue
        pending = true
        window.postMessage({ __dualSubsLoad: box.lang }, '*') // bridge → player.setOption(track)
        await sleep(1600) // let the player switch + fetch + bridge capture
      }
      if (!pending) break
      await sleep(500)
    }
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
    next.boxes.forEach((nb, i) => {
      const box = settings.boxes[i]!
      if (box.lang !== nb.lang) { box.lang = nb.lang; cuesByBox[box.id] = [] } // re-fetch new language
      box.style = nb.style
      views[box.id]!.setStyle(styleToCss(nb.style))
    })
    if (!settings.enabled) {
      loadGen++ // cancel in-flight loading
      for (const box of settings.boxes) cuesByBox[box.id] = []
      setNativeHidden(false)
    } else {
      setNativeHidden(!settings.nativeSubtitles) // keep YouTube's captions if the user opted in
      void startLoading()
    }
  }

  if (settings.enabled) { setNativeHidden(!settings.nativeSubtitles); void startLoading() }

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

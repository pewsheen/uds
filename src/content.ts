import type { BoxConfig, Cue, DisplayMode, Fraction, Settings } from './core/types'
import { initTick, tick } from './core/tick'
import { resolveAnchor, pickVerticalEdge } from './core/anchor'
import { toFraction, clampFraction, computeBoxRect } from './core/geometry'
import { avoidOverlap } from './core/overlap'
import { styleToCss } from './core/style'
import { decideMountTarget } from './core/mount'
import { buildTimedTextUrl } from './core/timedtext-url'
import { parseTimedText } from './core/parse'
import { createNetAdapter } from './adapters/net'
import { createStorageAdapter } from './adapters/storage'
import { createPlayerAdapter } from './adapters/player'
import { createRenderer, type BoxView } from './adapters/renderer'

async function findTrackBaseUrl(): Promise<string | null> {
  // YouTube exposes caption tracks via the player response. Read the first track's baseUrl.
  const pr = (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse as
    | { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl: string }[] } } }
    | undefined
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return tracks && tracks.length > 0 ? tracks[0]!.baseUrl : null
}

async function main() {
  const store = createStorageAdapter(chrome.storage.sync)
  const net = createNetAdapter()
  const player = createPlayerAdapter()
  const renderer = createRenderer()

  const settings: Settings = await store.load()
  if (!settings.enabled) return

  const base = await findTrackBaseUrl()
  if (!base) return

  const cuesByBox: Record<string, Cue[]> = {}
  for (const box of settings.boxes) {
    const xml = await net.fetchText(buildTimedTextUrl({ baseUrl: base }, box.lang))
    cuesByBox[box.id] = parseTimedText(xml)
  }

  const views: Record<string, BoxView> = {}
  const tickStates: Record<string, ReturnType<typeof initTick>> = {}
  const mode: DisplayMode = player.displayMode()
  for (const box of settings.boxes) {
    const target = decideMountTarget(mode, player.fullscreenEl() !== null)
    const view = renderer.createBox(target, player.fullscreenEl(), box.id)
    view.setStyle(styleToCss(box.style))
    views[box.id] = view
    tickStates[box.id] = initTick()
    attachDrag(box, view)
  }

  function render() {
    const t = player.currentTime()
    for (const box of settings.boxes) {
      const res = tick(tickStates[box.id]!, t, cuesByBox[box.id] ?? [])
      tickStates[box.id] = res.state
      if (res.renderCommand) views[box.id]!.setText(res.renderCommand.text)
      const place = box.posByMode[player.displayMode()]
      views[box.id]!.place({ fx: place.fx, fy: place.fy }, player.playerRect(), place.vEdge)
    }
    requestAnimationFrame(render)
  }
  requestAnimationFrame(render)

  function attachDrag(box: BoxConfig, view: BoxView) {
    let dragging = false
    view.el.addEventListener('pointerdown', (e) => {
      dragging = true
      view.el.setPointerCapture(e.pointerId)
    })
    view.el.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const point = { x: e.clientX, y: e.clientY }
      const ref = player.playerRect()
      const anchor = resolveAnchor(point, ref)
      const refBox = anchor === 'video'
        ? ref
        : { x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
      let f: Fraction = toFraction(point, refBox)
      const vEdge = pickVerticalEdge(f.fy)
      const size = view.measure()
      const vp = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
      f = clampFraction(f, refBox, size, vEdge, vp, 8)
      view.place(f, refBox, vEdge)
      stash(box, anchor, vEdge, f)
    })
    view.el.addEventListener('pointerup', () => {
      void (async () => {
        dragging = false
        // drop-time overlap avoidance against the other box (same anchor only)
        const me = box.posByMode[player.displayMode()]
        const other = settings.boxes.find((b) => b.id !== box.id)!
        const otherPlace = other.posByMode[player.displayMode()]
        if (me.anchor === otherPlace.anchor) {
          const ref = me.anchor === 'video'
            ? player.playerRect()
            : { x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
          const myRect = computeBoxRect({ fx: me.fx, fy: me.fy }, ref, view.measure(), me.vEdge)
          const otherRect = computeBoxRect({ fx: otherPlace.fx, fy: otherPlace.fy }, ref, views[other.id]!.measure(), otherPlace.vEdge)
          const cleared = avoidOverlap(myRect, [otherRect], 8)
          me.fy = toFraction({ x: cleared.x + cleared.width / 2, y: me.vEdge === 'top' ? cleared.y : cleared.y + cleared.height }, ref).fy
        }
        await store.save(settings)
      })()
    })
  }

  function stash(box: BoxConfig, anchor: 'video' | 'page', vEdge: 'top' | 'bottom', f: Fraction) {
    const mode = player.displayMode()
    box.posByMode[mode] = { anchor, vEdge, fx: f.fx, fy: f.fy }
  }
}

void main()

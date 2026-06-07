import type { Anchor, Fraction, MountTarget, Rect, Size, VEdge } from '../core/types'
import { computeBoxRect } from '../core/geometry'

export type BoxView = {
  el: HTMLElement
  setText: (text: string | null) => void
  setStyle: (css: Record<string, string>) => void
  place: (f: Fraction, refBox: Rect, vEdge: VEdge, anchor: Anchor) => void
  measure: () => Size
  remove: () => void
}

export function createRenderer(doc: Document = document) {
  let layer: HTMLElement | null = null
  function ensureLayer(target: MountTarget, fullscreenEl: Element | null): HTMLElement {
    const host = target.kind === 'fullscreen' && fullscreenEl ? (fullscreenEl as HTMLElement) : doc.body
    if (!layer) {
      layer = doc.createElement('div')
      layer.id = 'dual-subs-layer'
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
      host.appendChild(layer)
    } else if (layer.parentElement !== host) {
      host.appendChild(layer) // re-parent the existing layer (and all its box children) to the new host
    }
    return layer
  }
  function createBox(target: MountTarget, fullscreenEl: Element | null, id: string): BoxView {
    const root = ensureLayer(target, fullscreenEl)
    const el = doc.createElement('div')
    el.className = 'dual-subs-box'
    el.dataset.boxId = id
    el.style.cssText = 'position:fixed;max-width:80vw;text-align:center;padding:6px 12px;border-radius:10px;pointer-events:auto;cursor:grab;white-space:normal;'
    root.appendChild(el)
    return {
      el,
      setText: (text) => { el.style.display = text ? 'block' : 'none'; el.textContent = text ?? '' },
      setStyle: (css) => { Object.assign(el.style, css) },
      place: (f, refBox, vEdge, anchor) => {
        const size = { width: el.offsetWidth, height: el.offsetHeight }
        const r = computeBoxRect(f, refBox, size, vEdge)
        el.style.left = `${r.x}px`
        el.style.top = `${r.y}px`
        el.dataset.anchor = anchor
        el.dataset.vedge = vEdge
      },
      measure: () => ({ width: el.offsetWidth, height: el.offsetHeight }),
      remove: () => el.remove(),
    }
  }
  return {
    createBox,
    ensureMount: (target: MountTarget, fullscreenEl: Element | null) => { ensureLayer(target, fullscreenEl) },
    destroy: () => { layer?.remove(); layer = null },
  }
}

import type {
  Anchor,
  Fraction,
  MountTarget,
  Rect,
  Size,
  VEdge,
} from "../core/types";
import { computeBoxRect } from "../core/geometry";

export type BoxView = {
  el: HTMLElement;
  setText: (text: string | null) => void;
  setStyle: (css: Record<string, string>) => void;
  place: (f: Fraction, refBox: Rect, vEdge: VEdge, anchor: Anchor) => void;
  measure: () => Size;
  remove: () => void;
};

export function createRenderer(doc: Document = document) {
  let layer: HTMLElement | null = null;
  let glow: HTMLElement | null = null;
  let glowStyle: HTMLStyleElement | null = null;

  // Apple-Intelligence-style glow: a slowly-rotating rainbow ring + soft colour glow,
  // drawn INWARD from the target's edges so it's visible even when the target is the
  // whole viewport (page anchor) — an outer glow would fall off-screen there.
  const GLOW_CSS =
    "@property --ds-angle{syntax:'<angle>';initial-value:0deg;inherits:false;}" +
    "@keyframes ds-spin{to{--ds-angle:360deg;}}" +
    "@keyframes ds-pulse{0%,100%{opacity:.82;}50%{opacity:1;}}" +
    "#uds-glow{position:fixed;pointer-events:none;display:none;border-radius:16px;z-index:2147483646;" +
    "box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),inset 0 0 28px 6px rgba(139,92,246,.45),inset 0 0 72px 16px rgba(34,211,238,.22);" +
    "animation:ds-pulse 2.6s ease-in-out infinite;}" +
    "#uds-glow .ds-ring{position:absolute;inset:0;border-radius:16px;padding:2.5px;" +
    "background:conic-gradient(from var(--ds-angle),#ff3b6b,#ff8a3d,#ffd23d,#3ddc84,#22d3ee,#3b82f6,#8b5cf6,#ec4899,#ff3b6b);" +
    "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;" +
    "animation:ds-spin 6s linear infinite;}";

  function ensureGlow(): HTMLElement | null {
    if (!layer) return null;
    if (!glowStyle) {
      glowStyle = doc.createElement("style");
      glowStyle.id = "uds-glow-style";
      glowStyle.textContent = GLOW_CSS;
      doc.documentElement.appendChild(glowStyle);
    }
    if (!glow) {
      glow = doc.createElement("div");
      glow.id = "uds-glow";
      const ring = doc.createElement("div");
      ring.className = "ds-ring";
      glow.appendChild(ring);
    }
    if (glow.parentElement !== layer) layer.appendChild(glow);
    return glow;
  }
  function ensureLayer(
    target: MountTarget,
    fullscreenEl: Element | null,
  ): HTMLElement {
    const host =
      target.kind === "fullscreen" && fullscreenEl
        ? (fullscreenEl as HTMLElement)
        : doc.body;
    if (!layer) {
      layer = doc.createElement("div");
      layer.id = "uds-layer";
      layer.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
      host.appendChild(layer);
    } else if (layer.parentElement !== host) {
      host.appendChild(layer); // re-parent the existing layer (and all its box children) to the new host
    }
    return layer;
  }
  function createBox(
    target: MountTarget,
    fullscreenEl: Element | null,
    id: string,
  ): BoxView {
    const root = ensureLayer(target, fullscreenEl);
    const el = doc.createElement("div");
    el.className = "uds-box";
    el.dataset.boxId = id;
    el.style.cssText =
      "position:fixed;max-width:80vw;text-align:center;padding:6px 12px;border-radius:10px;pointer-events:auto;cursor:grab;white-space:normal;user-select:none;-webkit-user-select:none;touch-action:none;";
    root.appendChild(el);
    return {
      el,
      setText: (text) => {
        el.style.display = text ? "block" : "none";
        el.textContent = text ?? "";
      },
      setStyle: (css) => {
        Object.assign(el.style, css);
      },
      place: (f, refBox, vEdge, anchor) => {
        const size = { width: el.offsetWidth, height: el.offsetHeight };
        const r = computeBoxRect(f, refBox, size, vEdge);
        el.style.left = `${r.x}px`;
        el.style.top = `${r.y}px`;
        el.dataset.anchor = anchor;
        el.dataset.vedge = vEdge;
      },
      measure: () => ({ width: el.offsetWidth, height: el.offsetHeight }),
      remove: () => el.remove(),
    };
  }
  return {
    createBox,
    ensureMount: (target: MountTarget, fullscreenEl: Element | null) => {
      ensureLayer(target, fullscreenEl);
    },
    showGlow: (rect: Rect) => {
      const g = ensureGlow();
      if (!g) return;
      g.style.left = `${rect.x}px`;
      g.style.top = `${rect.y}px`;
      g.style.width = `${rect.width}px`;
      g.style.height = `${rect.height}px`;
      g.style.display = "block";
    },
    hideGlow: () => {
      if (glow) glow.style.display = "none";
    },
    destroy: () => {
      layer?.remove();
      layer = null;
      glow = null;
    },
  };
}

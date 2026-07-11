import type { Fraction, Point, Rect, Size, VEdge } from "./types";

export function toFraction(point: Point, box: Rect): Fraction {
  return {
    fx: (point.x - box.x) / box.width,
    fy: (point.y - box.y) / box.height,
  };
}

export function fromFraction(f: Fraction, box: Rect): Point {
  return { x: box.x + f.fx * box.width, y: box.y + f.fy * box.height };
}

export function computeBoxRect(
  f: Fraction,
  box: Rect,
  size: Size,
  vEdge: VEdge,
): Rect {
  const cx = box.x + f.fx * box.width;
  const anchorY = box.y + f.fy * box.height;
  const x = cx - size.width / 2;
  const y = vEdge === "top" ? anchorY : anchorY - size.height;
  return { x, y, width: size.width, height: size.height };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampFraction(
  f: Fraction,
  box: Rect,
  size: Size,
  vEdge: VEdge,
  viewport: Size,
  margin: number,
): Fraction {
  const r = computeBoxRect(f, box, size, vEdge);
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  const left = clamp(r.x, margin, maxX);
  const top = clamp(r.y, margin, maxY);
  const cx = left + size.width / 2;
  const anchorY = vEdge === "top" ? top : top + size.height;
  return { fx: (cx - box.x) / box.width, fy: (anchorY - box.y) / box.height };
}

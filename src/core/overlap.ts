import type { Rect } from './types'

export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  )
}

export function avoidOverlap(moved: Rect, others: Rect[], gap: number): Rect {
  let r: Rect = { ...moved }
  for (const o of others) {
    if (!rectsOverlap(r, o, gap)) continue
    const moveUp = o.y - gap - (r.y + r.height)
    const moveDown = o.y + o.height + gap - r.y
    const dy = Math.abs(moveUp) <= Math.abs(moveDown) ? moveUp : moveDown
    r = { ...r, y: r.y + dy }
  }
  return r
}

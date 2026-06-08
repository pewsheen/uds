import type { StyleSettings } from './types'

export function hexToRgb(hex: unknown): { r: number; g: number; b: number } {
  const black = { r: 0, g: 0, b: 0 }
  if (typeof hex !== 'string') return black
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return black
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function clamp01(v: number): number {
  const c = v < 0 ? 0 : v > 1 ? 1 : v
  // Avoid scientific notation (e.g. 5e-324) in the output string by rounding
  // to 4 decimal places — sufficient precision for an opacity value.
  return Math.round(c * 10000) / 10000
}

export type CssDeclarations = {
  fontSize: string
  color: string
  backgroundColor: string
  fontFamily: string
  textShadow: string
}

export function styleToCss(s: StyleSettings): CssDeclarations {
  const { r, g, b } = hexToRgb(s.bgColor)
  return {
    fontSize: `${s.fontSizePx}px`,
    color: s.color,
    backgroundColor: `rgba(${r},${g},${b},${clamp01(s.bgOpacity)})`,
    fontFamily: s.fontFamily,
    textShadow: s.outline ? '0 2px 6px rgba(0,0,0,0.85)' : 'none',
  }
}

import type { StyleSettings } from './types'

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
  return {
    fontSize: `${s.fontSizePx}px`,
    color: s.color,
    backgroundColor: `rgba(0,0,0,${clamp01(s.bgOpacity)})`,
    fontFamily: s.fontFamily,
    textShadow: s.outline ? '0 2px 6px rgba(0,0,0,0.85)' : 'none',
  }
}

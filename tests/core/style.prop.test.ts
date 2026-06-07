import { test } from 'vitest'
import fc from 'fast-check'
import { styleToCss } from '../../src/core/style'

test('background opacity is always within [0,1] in the output', () => {
  fc.assert(fc.property(
    fc.double({ min: -5, max: 5, noNaN: true }),
    fc.integer({ min: 1, max: 200 }),
    (op, size) => {
      const css = styleToCss({ fontSizePx: size, color: '#000', bgOpacity: op, fontFamily: 'x', outline: false })
      const m = /rgba\(0,0,0,([\d.]+)\)/.exec(css.backgroundColor)
      if (!m) return false
      const a = parseFloat(m[1]!)
      return a >= 0 && a <= 1 && css.fontSize === `${size}px`
    },
  ))
})

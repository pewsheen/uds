import { expect, test } from 'vitest'
import { styleToCss } from '../../src/core/style'

test('maps settings to css declarations', () => {
  const css = styleToCss({ fontSizePx: 24, color: '#fff', bgOpacity: 0.6, fontFamily: 'Arial', outline: true })
  expect(css.fontSize).toBe('24px')
  expect(css.color).toBe('#fff')
  expect(css.backgroundColor).toBe('rgba(0,0,0,0.6)')
  expect(css.fontFamily).toBe('Arial')
  expect(css.textShadow).not.toBe('none')
})

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

test('outline:false yields textShadow none', () => {
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgOpacity: 0.5, fontFamily: 'x', outline: false }).textShadow).toBe('none')
})

test('outline:true yields the exact shadow string (not empty)', () => {
  // kills StringLiteral mutant that replaces the shadow with ''
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgOpacity: 0.5, fontFamily: 'x', outline: true }).textShadow)
    .toBe('0 2px 6px rgba(0,0,0,0.85)')
})

test('bgOpacity below 0 and above 1 is clamped into [0,1]', () => {
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgOpacity: -0.5, fontFamily: 'x', outline: false }).backgroundColor)
    .toBe('rgba(0,0,0,0)')
  expect(styleToCss({ fontSizePx: 20, color: '#000', bgOpacity: 2, fontFamily: 'x', outline: false }).backgroundColor)
    .toBe('rgba(0,0,0,1)')
})

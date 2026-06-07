import { expect, test } from 'vitest'
import { resolveAnchor, pickVerticalEdge } from '../../src/core/anchor'

const player = { x: 100, y: 50, width: 800, height: 450 }

test('resolveAnchor: inside player -> video, outside -> page', () => {
  expect(resolveAnchor({ x: 500, y: 200 }, player)).toBe('video')
  expect(resolveAnchor({ x: 10, y: 10 }, player)).toBe('page')
})

test('pickVerticalEdge: top half -> top, bottom half -> bottom (0.5 -> bottom)', () => {
  expect(pickVerticalEdge(0.2)).toBe('top')
  expect(pickVerticalEdge(0.5)).toBe('bottom')
  expect(pickVerticalEdge(0.9)).toBe('bottom')
})

test('resolveAnchor: exact edges are inside; one pixel outside is page', () => {
  expect(resolveAnchor({ x: 100, y: 50 }, player)).toBe('video')   // top-left corner
  expect(resolveAnchor({ x: 900, y: 500 }, player)).toBe('video')  // bottom-right corner
  expect(resolveAnchor({ x: 99, y: 200 }, player)).toBe('page')    // left of left edge
  expect(resolveAnchor({ x: 901, y: 200 }, player)).toBe('page')   // right of right edge
  expect(resolveAnchor({ x: 500, y: 49 }, player)).toBe('page')    // above top edge
  expect(resolveAnchor({ x: 500, y: 501 }, player)).toBe('page')   // below bottom edge
})

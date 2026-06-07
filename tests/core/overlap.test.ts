import { expect, test } from 'vitest'
import { avoidOverlap, rectsOverlap } from '../../src/core/overlap'

test('pushes the moved rect clear of the other with a gap', () => {
  const a = { x: 0, y: 100, width: 100, height: 40 }
  const other = { x: 20, y: 110, width: 100, height: 40 }
  const out = avoidOverlap(a, [other], 8)
  expect(rectsOverlap(out, other, 8)).toBe(false)
})

test('no-op when already clear', () => {
  const a = { x: 0, y: 0, width: 50, height: 20 }
  const other = { x: 0, y: 200, width: 50, height: 20 }
  expect(avoidOverlap(a, [other], 8)).toEqual(a)
})

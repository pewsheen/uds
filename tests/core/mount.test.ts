import { expect, test } from 'vitest'
import { decideMountTarget } from '../../src/core/mount'

test('fullscreen with a fullscreen element mounts into fullscreen, else overlay layer', () => {
  expect(decideMountTarget('fullscreen', true)).toEqual({ kind: 'fullscreen' })
  expect(decideMountTarget('fullscreen', false)).toEqual({ kind: 'overlayLayer' })
  expect(decideMountTarget('default', true)).toEqual({ kind: 'overlayLayer' })
  expect(decideMountTarget('theater', false)).toEqual({ kind: 'overlayLayer' })
})

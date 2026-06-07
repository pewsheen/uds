import { expect, test } from 'vitest'
import { initTick, tick } from '../../src/core/tick'
import type { Cue } from '../../src/core/types'

const cues: Cue[] = [{ start: 0, end: 1, text: 'A' }, { start: 1, end: 2, text: 'B' }]

test('emits a command only when the active cue changes', () => {
  const r1 = tick(initTick(), 0.5, cues)
  expect(r1.renderCommand).toEqual({ text: 'A' })
  const r2 = tick(r1.state, 0.7, cues)
  expect(r2.renderCommand).toBeUndefined()
  const r3 = tick(r2.state, 1.5, cues)
  expect(r3.renderCommand).toEqual({ text: 'B' })
  const r4 = tick(r3.state, 5, cues)
  expect(r4.renderCommand).toEqual({ text: null })
})

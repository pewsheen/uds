import { test } from 'vitest'
import fc from 'fast-check'
import { initTick, tick } from '../../src/core/tick'
import type { Cue } from '../../src/core/types'

const cues: Cue[] = [{ start: 0, end: 1, text: 'A' }, { start: 1, end: 2, text: 'B' }]

test('first tick always emits the correct text for t', () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 3, noNaN: true }), (t) => {
    const { renderCommand } = tick(initTick(), t, cues)
    const expected = t >= 0 && t < 1 ? 'A' : t >= 1 && t < 2 ? 'B' : null
    return renderCommand !== undefined && renderCommand.text === expected
  }))
})

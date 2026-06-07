import { expect, test } from 'vitest'
import { selectCue } from '../../src/core/cue-select'
import type { Cue } from '../../src/core/types'

const cues: Cue[] = [
  { start: 1, end: 2, text: 'A' },
  { start: 2, end: 3, text: 'B' },
]

test('half-open interval [start,end): exact end belongs to next cue', () => {
  expect(selectCue(cues, 1)!.text).toBe('A')
  expect(selectCue(cues, 1.999)!.text).toBe('A')
  expect(selectCue(cues, 2)!.text).toBe('B')   // off-by-one guard
  expect(selectCue(cues, 0.5)).toBeNull()
  expect(selectCue(cues, 3)).toBeNull()
})

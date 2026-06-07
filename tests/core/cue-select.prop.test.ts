import { test } from 'vitest'
import fc from 'fast-check'
import { selectCue } from '../../src/core/cue-select'
import type { Cue } from '../../src/core/types'

const cuesArb = fc.array(fc.record({
  start: fc.double({ min: 0, max: 100, noNaN: true }),
  len: fc.double({ min: 0.1, max: 10, noNaN: true }),
  text: fc.string(),
})).map(rows => {
  let t = 0
  const cues: Cue[] = []
  for (const r of rows) { const start = t; const end = start + r.len; cues.push({ start, end, text: r.text }); t = end }
  return cues
})

function oracle(cues: Cue[], t: number): Cue | null {
  for (const c of cues) if (c.start <= t && t < c.end) return c
  return null
}

test('returned cue always contains t; matches the oracle', () => {
  fc.assert(fc.property(cuesArb, fc.double({ min: 0, max: 120, noNaN: true }), (cues, t) => {
    const got = selectCue(cues, t)
    if (got && !(got.start <= t && t < got.end)) return false
    return got === oracle(cues, t)
  }))
})

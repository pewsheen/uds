import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTimedText } from '../../src/core/parse'

const xml = readFileSync(new URL('../../fixtures/timedtext-sample.xml', import.meta.url), 'utf8')

test('parses cues with decoded text and computed end', () => {
  const cues = parseTimedText(xml)
  expect(cues).toEqual([
    { start: 0.5, end: 2.0, text: 'Hello & welcome' },
    { start: 2.0, end: 4.25, text: "It's a test" },
    { start: 4.5, end: 5.5, text: '<end>' },
  ])
})

test('skips dur<=0 and non-finite start, and trims text', () => {
  expect(parseTimedText('<text start="1.0" dur="0">x</text>')).toEqual([])
  expect(parseTimedText('<text start="." dur="1">x</text>')).toEqual([])
  expect(parseTimedText('<text start="1" dur="1">  hi  </text>')).toEqual([{ start: 1, end: 2, text: 'hi' }])
})

test('out-of-order cues are sorted ascending by start', () => {
  // input deliberately unsorted; a stable ascending sort must reorder it.
  // kills the `a.start - b.start` -> `a.start + b.start` mutant (which would NOT sort here).
  const xml =
    '<text start="3" dur="1">third</text>' +
    '<text start="1" dur="1">first</text>' +
    '<text start="2" dur="1">second</text>'
  expect(parseTimedText(xml).map((c) => c.text)).toEqual(['first', 'second', 'third'])
})

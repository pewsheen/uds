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

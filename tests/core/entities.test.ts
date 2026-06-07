import { expect, test } from 'vitest'
import { decodeEntities } from '../../src/core/entities'

test('decodes named and numeric entities', () => {
  expect(decodeEntities('a &amp; b')).toBe('a & b')
  expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>')
  expect(decodeEntities('it&#39;s &quot;ok&quot;')).toBe(`it's "ok"`)
  expect(decodeEntities('&#x41;')).toBe('A')
})

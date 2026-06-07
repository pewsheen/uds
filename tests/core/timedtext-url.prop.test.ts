import { test } from 'vitest'
import fc from 'fast-check'
import { buildTimedTextUrl } from '../../src/core/timedtext-url'

const langArb = fc.constantFrom('en', 'zh-Hant', 'ja', 'ko', 'fr', 'de', 'es')

test('result always carries the requested tlang', () => {
  fc.assert(fc.property(langArb, (lang) => {
    const url = buildTimedTextUrl({ baseUrl: 'https://yt/api/timedtext?v=x' }, lang)
    return new URL(url).searchParams.get('tlang') === lang
  }))
})

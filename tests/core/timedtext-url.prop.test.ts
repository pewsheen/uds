import { test } from 'vitest'
import fc from 'fast-check'
import { buildTimedTextUrl } from '../../src/core/timedtext-url'

const langArb = fc.constantFrom('en', 'zh-Hant', 'ja', 'ko', 'fr', 'de', 'es')

test('result always carries the requested tlang and fmt=srv1', () => {
  fc.assert(fc.property(langArb, (lang) => {
    const url = buildTimedTextUrl({ baseUrl: 'https://yt/api/timedtext?v=x' }, lang)
    const u = new URL(url)
    return u.searchParams.get('tlang') === lang && u.searchParams.get('fmt') === 'srv1'
  }))
})

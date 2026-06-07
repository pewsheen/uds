import { expect, test } from 'vitest'
import { buildTimedTextUrl } from '../../src/core/timedtext-url'

test('adds tlang and fmt to the base url', () => {
  const url = buildTimedTextUrl({ baseUrl: 'https://yt/api/timedtext?v=abc&lang=en' }, 'zh-Hant')
  const u = new URL(url)
  expect(u.searchParams.get('tlang')).toBe('zh-Hant')
  expect(u.searchParams.get('fmt')).toBe('srv1')
  expect(u.searchParams.get('v')).toBe('abc')
})

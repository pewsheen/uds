import { expect, test } from 'vitest'
import { createNetAdapter } from '../../src/adapters/net'

const okFetch = (body: string) =>
  (async () => ({ ok: true, status: 200, text: async () => body })) as unknown as typeof fetch
const badFetch = (status: number) =>
  (async () => ({ ok: false, status, text: async () => '' })) as unknown as typeof fetch

test('returns body text on ok', async () => {
  const net = createNetAdapter(okFetch('<x/>'))
  expect(await net.fetchText('https://u')).toBe('<x/>')
})

test('throws on non-ok status', async () => {
  const net = createNetAdapter(badFetch(404))
  await expect(net.fetchText('https://u')).rejects.toThrow(/404/)
})

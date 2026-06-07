import { expect, test } from 'vitest'
import { createStorageAdapter, DEFAULT_SETTINGS } from '../../src/adapters/storage'
import type { Settings } from '../../src/core/types'

function fakeArea() {
  let data: Record<string, unknown> = {}
  return {
    async get(key: string) { return key in data ? { [key]: data[key] } : {} },
    async set(items: Record<string, unknown>) { data = { ...data, ...items } },
  } as unknown as chrome.storage.StorageArea
}

test('round-trips settings', async () => {
  const store = createStorageAdapter(fakeArea())
  const s: Settings = { ...DEFAULT_SETTINGS, enabled: false }
  await store.save(s)
  expect(await store.load()).toEqual(s)
})

test('returns defaults when empty', async () => {
  const store = createStorageAdapter(fakeArea())
  expect(await store.load()).toEqual(DEFAULT_SETTINGS)
})

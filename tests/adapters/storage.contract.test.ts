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

test('fills missing bgColor on legacy persisted settings', async () => {
  const area = fakeArea()
  const legacy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  delete legacy.boxes[0].style.bgColor // simulate data saved before bgColor existed
  await area.set({ dualSubsSettings: legacy })
  const store = createStorageAdapter(area)
  const loaded = await store.load()
  expect(loaded.boxes[0].style.bgColor).toBe('#000000')
  expect(loaded.boxes[1].style.bgColor).toBe('#000000')
})

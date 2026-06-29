import { expect, test } from 'vitest'
import { createStorageAdapter, DEFAULT_SETTINGS } from '../../src/adapters/storage'
import type { DisplayMode, Placement, Settings } from '../../src/core/types'

const MODES: DisplayMode[] = ['default', 'theater', 'fullscreen', 'miniplayer']

function fakeArea() {
  let data: Record<string, unknown> = {}
  return {
    async get(key: string) { return key in data ? { [key]: data[key] } : {} },
    async set(items: Record<string, unknown>) { data = { ...data, ...items } },
  } as unknown as chrome.storage.StorageArea
}

function legacyOverlappedPos(): Record<DisplayMode, Placement> {
  return MODES.reduce((acc, mode) => {
    acc[mode] = { anchor: 'video', vEdge: 'bottom', fx: 0.5, fy: 0.9 }
    return acc
  }, {} as Record<DisplayMode, Placement>)
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

test('default subtitle boxes start on separate rows', () => {
  for (const mode of MODES) {
    const first = DEFAULT_SETTINGS.boxes[0].posByMode[mode]
    const second = DEFAULT_SETTINGS.boxes[1].posByMode[mode]
    expect(first.anchor).toBe('video')
    expect(second.anchor).toBe('video')
    expect(first.vEdge).toBe('bottom')
    expect(second.vEdge).toBe('bottom')
    expect(first.fx).toBe(second.fx)
    expect(first.fy).toBeLessThan(second.fy)
  }
})

test('separates legacy persisted boxes that used the old overlapping defaults', async () => {
  const area = fakeArea()
  const legacy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings
  legacy.boxes[0].posByMode = legacyOverlappedPos()
  legacy.boxes[1].posByMode = legacyOverlappedPos()
  await area.set({ dualSubsSettings: legacy })

  const store = createStorageAdapter(area)
  const loaded = await store.load()

  for (const mode of MODES) {
    const first = loaded.boxes[0].posByMode[mode]
    const second = loaded.boxes[1].posByMode[mode]
    expect(first.fy).toBeLessThan(second.fy)
    expect(first.fy).not.toBe(0.9)
    expect(second.fy).not.toBe(0.9)
  }
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

test('falls back to defaults on malformed (missing/short boxes) persisted data', async () => {
  const area = fakeArea()
  await area.set({ dualSubsSettings: { enabled: true } }) // truthy but no boxes array
  const store = createStorageAdapter(area)
  expect(await store.load()).toEqual(DEFAULT_SETTINGS)
})

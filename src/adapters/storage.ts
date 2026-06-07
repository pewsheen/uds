import type { BoxConfig, DisplayMode, Placement, Settings, StyleSettings } from '../core/types'

const KEY = 'dualSubsSettings'

const DEFAULT_STYLE: StyleSettings = {
  fontSizePx: 24, color: '#ffffff', bgOpacity: 0.55, fontFamily: 'system-ui, sans-serif', outline: true,
}
const MODES: DisplayMode[] = ['default', 'theater', 'fullscreen', 'miniplayer']
function defaultPlacement(): Placement { return { anchor: 'video', vEdge: 'bottom', fx: 0.5, fy: 0.9 } }
function defaultPos(): Record<DisplayMode, Placement> {
  return MODES.reduce((acc, m) => { acc[m] = defaultPlacement(); return acc }, {} as Record<DisplayMode, Placement>)
}
function box(id: BoxConfig['id'], lang: string): BoxConfig {
  return { id, lang, style: { ...DEFAULT_STYLE }, posByMode: defaultPos() }
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  boxes: [box('sub1', 'en'), box('sub2', 'zh-Hant')],
}

export type Store = { load: () => Promise<Settings>; save: (s: Settings) => Promise<void> }

export function createStorageAdapter(area: chrome.storage.StorageArea): Store {
  return {
    async load() {
      const got = await area.get(KEY)
      const value = (got as Record<string, unknown>)[KEY]
      return value ? (value as Settings) : DEFAULT_SETTINGS
    },
    async save(s) { await area.set({ [KEY]: s }) },
  }
}

import type { BoxConfig, DisplayMode, Placement, Settings, StyleSettings } from '../core/types'

const KEY = 'dualSubsSettings'

const DEFAULT_STYLE: StyleSettings = {
  fontSizePx: 24, color: '#ffffff', bgColor: '#000000', bgOpacity: 0.55, fontFamily: 'system-ui, sans-serif', outline: true,
}
const MODES: DisplayMode[] = ['default', 'theater', 'fullscreen', 'miniplayer']
const DEFAULT_FY: Record<BoxConfig['id'], number> = { sub1: 0.76, sub2: 0.92 }
const LEGACY_OVERLAPPED_PLACEMENT: Placement = { anchor: 'video', vEdge: 'bottom', fx: 0.5, fy: 0.9 }

function defaultPlacement(id: BoxConfig['id']): Placement { return { anchor: 'video', vEdge: 'bottom', fx: 0.5, fy: DEFAULT_FY[id] } }
function defaultPos(id: BoxConfig['id']): Record<DisplayMode, Placement> {
  return MODES.reduce((acc, m) => { acc[m] = defaultPlacement(id); return acc }, {} as Record<DisplayMode, Placement>)
}
function box(id: BoxConfig['id'], lang: string): BoxConfig {
  return { id, lang, style: { ...DEFAULT_STYLE }, posByMode: defaultPos(id) }
}

function samePlacement(a: Placement | undefined, b: Placement): boolean {
  return !!a && a.anchor === b.anchor && a.vEdge === b.vEdge && a.fx === b.fx && a.fy === b.fy
}

function allModesMatch(boxConfig: BoxConfig, placement: Placement): boolean {
  return MODES.every((mode) => samePlacement(boxConfig.posByMode[mode], placement))
}

function separateLegacyOverlappedBoxes(boxes: BoxConfig[]): BoxConfig[] {
  if (boxes.length < 2) return boxes
  if (!allModesMatch(boxes[0]!, LEGACY_OVERLAPPED_PLACEMENT) || !allModesMatch(boxes[1]!, LEGACY_OVERLAPPED_PLACEMENT)) return boxes
  return boxes.map((b) => ({ ...b, posByMode: defaultPos(b.id) }))
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  nativeSubtitles: false,
  boxes: [box('sub1', 'en'), box('sub2', 'zh-Hant')],
}

export type Store = { load: () => Promise<Settings>; save: (s: Settings) => Promise<void> }

export function createStorageAdapter(area: chrome.storage.StorageArea): Store {
  return {
    async load() {
      const got = await area.get(KEY)
      const value = (got as Record<string, unknown>)[KEY] as Settings | undefined
      // Fall back to defaults on absent or malformed/truncated stored data, so a
      // corrupted record can't crash load() (and thus the content script).
      if (!value || !Array.isArray(value.boxes) || value.boxes.length < 2) return DEFAULT_SETTINGS
      const boxes = value.boxes.map((b) => ({ ...b, style: { ...DEFAULT_STYLE, ...b.style } }))
      const separatedBoxes = separateLegacyOverlappedBoxes(boxes)
      return { ...value, boxes: separatedBoxes as [BoxConfig, BoxConfig] }
    },
    async save(s) { await area.set({ [KEY]: s }) },
  }
}

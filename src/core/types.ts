export type Cue = { start: number; end: number; text: string }

export type DisplayMode = 'default' | 'theater' | 'fullscreen' | 'miniplayer'
export type Anchor = 'video' | 'page'
export type VEdge = 'top' | 'bottom'

export type Placement = { anchor: Anchor; vEdge: VEdge; fx: number; fy: number }

export type StyleSettings = {
  fontSizePx: number
  color: string
  bgColor: string // hex, e.g. '#000000'
  bgOpacity: number // 0..1
  fontFamily: string
  outline: boolean
}

export type BoxId = 'sub1' | 'sub2'
export type BoxConfig = {
  id: BoxId
  lang: string
  style: StyleSettings
  posByMode: Record<DisplayMode, Placement>
}
export type Settings = {
  enabled: boolean
  boxes: [BoxConfig, BoxConfig]
  // When true, keep YouTube's own caption layer visible instead of hiding it.
  nativeSubtitles?: boolean
}

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type Fraction = { fx: number; fy: number }

// A caption track the video actually offers (from ytInitialPlayerResponse).
// `kind` is 'asr' for YouTube's auto-generated track.
export type CaptionTrack = { baseUrl: string; languageCode: string; name?: string; kind?: string }

export type LifecycleState =
  | { kind: 'idle' }
  | { kind: 'loadingTracks' }
  | { kind: 'active' }
  | { kind: 'error'; message: string }
export type LifecycleEvent =
  | { type: 'enable' }
  | { type: 'tracksLoaded' }
  | { type: 'failed'; message: string }
  | { type: 'retry' }
  | { type: 'disable' }

export type TickState = { activeText: string | null; emitted: boolean }
export type RenderCommand = { text: string | null }

export type MountTarget = { kind: 'fullscreen' } | { kind: 'overlayLayer' }

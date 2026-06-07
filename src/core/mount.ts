import type { DisplayMode, MountTarget } from './types'

export function decideMountTarget(mode: DisplayMode, hasFullscreenEl: boolean): MountTarget {
  if (mode === 'fullscreen' && hasFullscreenEl) return { kind: 'fullscreen' }
  return { kind: 'overlayLayer' }
}

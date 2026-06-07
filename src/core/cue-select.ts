import type { Cue } from './types'

export function selectCue(cues: Cue[], t: number): Cue | null {
  for (const c of cues) {
    if (c.start <= t && t < c.end) return c
  }
  return null
}

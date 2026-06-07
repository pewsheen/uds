import type { Cue, RenderCommand, TickState } from './types'
import { selectCue } from './cue-select'

export function initTick(): TickState {
  return { activeText: undefined as unknown as string | null }
}

export function tick(
  state: TickState,
  currentTime: number,
  cues: Cue[],
): { state: TickState; renderCommand?: RenderCommand } {
  const cue = selectCue(cues, currentTime)
  const text = cue ? cue.text : null
  if (text === state.activeText) return { state }
  return { state: { activeText: text }, renderCommand: { text } }
}

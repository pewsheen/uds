import type { Cue, RenderCommand, TickState } from './types'
import { selectCue } from './cue-select'

export function initTick(): TickState {
  return { activeText: null, emitted: false }
}

export function tick(
  state: TickState,
  currentTime: number,
  cues: Cue[],
): { state: TickState; renderCommand?: RenderCommand } {
  const cue = selectCue(cues, currentTime)
  const text = cue ? cue.text : null
  if (state.emitted && text === state.activeText) return { state }
  return { state: { activeText: text, emitted: true }, renderCommand: { text } }
}

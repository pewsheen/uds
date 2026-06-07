import type { Cue } from './types'

type Json3Seg = { utf8?: string }
type Json3Event = { tStartMs?: number; dDurationMs?: number; segs?: Json3Seg[] }
type Json3 = { events?: Json3Event[] }

// YouTube's `fmt=json3` caption format. Events without `segs` are window/style
// definitions; events without timing or with empty text are skipped.
export function parseJson3(json: string): Cue[] {
  let data: Json3
  try { data = JSON.parse(json) as Json3 } catch { return [] }
  const events = Array.isArray(data?.events) ? data.events : []
  const cues: Cue[] = []
  for (const ev of events) {
    if (!ev || !Array.isArray(ev.segs)) continue
    if (typeof ev.tStartMs !== 'number' || typeof ev.dDurationMs !== 'number') continue
    const start = ev.tStartMs / 1000
    const dur = ev.dDurationMs / 1000
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) continue
    const text = ev.segs.map((s) => s.utf8 ?? '').join('').trim()
    if (!text) continue
    cues.push({ start, end: start + dur, text })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}

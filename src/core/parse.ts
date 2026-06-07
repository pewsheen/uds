import type { Cue } from './types'
import { decodeEntities } from './entities'

const ROW = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g

export function parseTimedText(xml: string): Cue[] {
  const cues: Cue[] = []
  for (const m of xml.matchAll(ROW)) {
    const start = parseFloat(m[1]!)
    const dur = parseFloat(m[2]!)
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) continue
    cues.push({ start, end: start + dur, text: decodeEntities(m[3]!).trim() })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}

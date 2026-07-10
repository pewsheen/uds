import type { Cue } from './types'
import { decodeEntities } from './entities'
import { parseJson3 } from './parse-json3'

// Caption bodies come from provider players in a few formats:
// YouTube json3 / srv1 XML, plus WebVTT and TTML/DFXP from Prime-style streams.
export function parseCaptions(body: string): Cue[] {
  const trimmed = body.trimStart()
  if (trimmed.startsWith('{')) return parseJson3(body)
  if (/^WEBVTT\b/i.test(trimmed)) return parseWebVtt(body)
  if (/^<tt[\s>]/i.test(trimmed) || /<p\b[^>]*(?:begin|end)=/i.test(trimmed)) return parseTtml(body)
  return parseTimedText(body)
}

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

export function parseWebVtt(vtt: string): Cue[] {
  const cues: Cue[] = []
  const blocks = vtt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length || /^WEBVTT\b/i.test(lines[0]!) || /^NOTE\b/i.test(lines[0]!) || /^STYLE\b/i.test(lines[0]!) || /^REGION\b/i.test(lines[0]!)) continue
    const timingIndex = lines.findIndex((l) => l.includes('-->'))
    if (timingIndex < 0) continue
    const timing = lines[timingIndex]!
    const m = timing.match(/(\S+)\s+-->\s+(\S+)/)
    if (!m) continue
    const start = parseTimestamp(m[1]!)
    const end = parseTimestamp(m[2]!)
    if (start === null || end === null || end <= start) continue
    const text = cleanCaptionText(lines.slice(timingIndex + 1).join('\n'))
    if (!text) continue
    cues.push({ start, end, text })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}

export function parseTtml(ttml: string): Cue[] {
  const cues: Cue[] = []
  const row = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
  for (const m of ttml.matchAll(row)) {
    const attrs = attrsFrom(m[1]!)
    const start = parseTimeExpression(attrs.get('begin'))
    const explicitEnd = parseTimeExpression(attrs.get('end'))
    const dur = parseTimeExpression(attrs.get('dur'))
    const end = explicitEnd ?? (start !== null && dur !== null ? start + dur : null)
    if (start === null || end === null || end <= start) continue
    const text = cleanCaptionText(m[2]!)
    if (!text) continue
    cues.push({ start, end, text })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}

function attrsFrom(src: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of src.matchAll(/\b([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? '')
  }
  return attrs
}

function parseTimeExpression(value: string | undefined): number | null {
  if (!value) return null
  const s = value.trim()
  const unit = s.match(/^([\d.]+)\s*(ms|s|m|h)$/i)
  if (unit) {
    const n = Number(unit[1])
    if (!Number.isFinite(n)) return null
    const u = unit[2]!.toLowerCase()
    if (u === 'ms') return n / 1000
    if (u === 's') return n
    if (u === 'm') return n * 60
    return n * 3600
  }
  return parseTimestamp(s)
}

function parseTimestamp(value: string): number | null {
  const bare = value.split(/[ \t]/)[0]!.replace(',', '.')
  const parts = bare.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return null
  const seconds = nums.pop()!
  const minutes = nums.pop()!
  const hours = nums.pop() ?? 0
  return hours * 3600 + minutes * 60 + seconds
}

function cleanCaptionText(text: string): string {
  return decodeEntities(text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim())
}

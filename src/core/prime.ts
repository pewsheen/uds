import type { CaptionTrack } from './types'

type JsonRecord = Record<string, unknown>
type TrackCandidate = {
  id?: string
  baseUrl?: string
  languageCode?: string
  name?: string
  kind?: string
}

const URL_KEYS = ['url', 'href', 'src', 'subtitleUrl', 'subtitle_url', 'timedTextUrl', 'timedTextURL']
const ID_KEYS = ['timedTextTrackId', 'trackId', 'id', 'subtitleTrackId', 'languageTrackId']
const LANG_KEYS = ['languageCode', 'language_code', 'lang', 'language', 'locale', 'rfc5646LanguageTag', 'trackLanguage']
const NAME_KEYS = ['displayName', 'name', 'label', 'languageName', 'description']
const KIND_KEYS = ['kind', 'type', 'trackType', 'subtype']

export function isPrimeCaptionUrl(url: string): boolean {
  return /(?:subtitle|caption|timedtext|ttml|webvtt|dfxp|\.vtt|\.ttml|\.ttml2)(?:[/?#._-]|$)/i.test(url)
}

export function looksLikePrimeCaptionBody(body: string): boolean {
  const s = body.trimStart().slice(0, 400).toLowerCase()
  return s.startsWith('webvtt') || s.startsWith('<tt') || s.includes('<tt ') || /<p\b[^>]*(?:begin|end)=/.test(s)
}

export function extractPrimeTracks(data: unknown): CaptionTrack[] {
  const partials: TrackCandidate[] = []
  const seen = new WeakSet<object>()
  const queue: unknown[] = [data]
  let inspected = 0

  while (inspected < queue.length && inspected < 5000) {
    const next = queue[inspected]
    inspected += 1
    if (!isRecord(next) || seen.has(next)) continue
    seen.add(next)

    const candidate = candidateFromRecord(next)
    if (candidate.id || candidate.baseUrl || candidate.languageCode || candidate.name) partials.push(candidate)

    for (const value of Object.values(next)) {
      if (isRecord(value) || Array.isArray(value)) queue.push(value)
    }
  }

  const byId = new Map<string, TrackCandidate>()
  const loose: TrackCandidate[] = []
  for (const p of partials) {
    if (p.id) byId.set(p.id, mergeCandidate(byId.get(p.id), p))
    else loose.push(p)
  }

  const out: CaptionTrack[] = []
  const seenTracks = new Set<string>()
  for (const p of [...byId.values(), ...loose]) {
    if (!p.baseUrl || !p.languageCode) continue
    const key = `${p.languageCode.toLowerCase()}\n${p.baseUrl}`
    if (seenTracks.has(key)) continue
    seenTracks.add(key)
    out.push({ baseUrl: p.baseUrl, languageCode: p.languageCode, name: p.name, kind: p.kind })
  }
  return out
}

function candidateFromRecord(o: JsonRecord): TrackCandidate {
  const id = firstString(o, ID_KEYS)
  const baseUrl = firstUrl(o, URL_KEYS) ?? firstCaptionUrl(o)
  const languageCode = firstString(o, LANG_KEYS) ?? langFromUrl(baseUrl)
  const name = firstString(o, NAME_KEYS)
  const kind = firstString(o, KIND_KEYS)
  return { id, baseUrl, languageCode, name, kind }
}

function mergeCandidate(a: TrackCandidate | undefined, b: TrackCandidate): TrackCandidate {
  return {
    id: a?.id ?? b.id,
    baseUrl: a?.baseUrl ?? b.baseUrl,
    languageCode: a?.languageCode ?? b.languageCode,
    name: a?.name ?? b.name,
    kind: a?.kind ?? b.kind,
  }
}

function firstString(o: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const s = stringValue(o[key])
    if (s) return s
  }
  return undefined
}

function firstUrl(o: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const s = stringValue(o[key])
    if (s && /^https?:\/\//i.test(s)) return s
  }
  return undefined
}

function firstCaptionUrl(o: JsonRecord): string | undefined {
  for (const value of Object.values(o)) {
    const s = stringValue(value)
    if (s && /^https?:\/\//i.test(s) && isPrimeCaptionUrl(s)) return s
  }
  return undefined
}

function langFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.searchParams.get('lang')
      ?? u.searchParams.get('language')
      ?? u.searchParams.get('locale')
      ?? undefined
  } catch {
    return undefined
  }
}

function stringValue(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (!isRecord(v)) return undefined
  return stringValue(v.simpleText)
    ?? stringValue(v.displayName)
    ?? stringValue(v.value)
    ?? stringValue(v.text)
    ?? stringValue(v.code)
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null
}



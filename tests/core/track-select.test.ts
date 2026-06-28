import { expect, test } from 'vitest'
import { pickTrack, parseSelector, selectorForTrack, captureMatchesBox } from '../../src/core/track-select'

const T = (languageCode: string, name?: string, kind?: string) => ({ baseUrl: `https://yt/${languageCode}${kind ?? ''}`, languageCode, name, kind })

test('exact language match wins', () => {
  expect(pickTrack([T('en'), T('zh-Hant')], 'zh-Hant')?.languageCode).toBe('zh-Hant')
})

test('falls back to the primary subtag when there is no exact match', () => {
  expect(pickTrack([T('en-US')], 'en')?.languageCode).toBe('en-US')
  expect(pickTrack([T('zh-Hans')], 'zh-Hant')?.languageCode).toBe('zh-Hans')
})

test('exact match is preferred over a primary-subtag fallback', () => {
  expect(pickTrack([T('en-US'), T('en')], 'en')?.languageCode).toBe('en')
})

test('returns null when nothing matches or input is empty', () => {
  expect(pickTrack([T('en')], 'ja')).toBeNull()
  expect(pickTrack([], 'en')).toBeNull()
  expect(pickTrack([T('en')], '')).toBeNull()
})

test('matching is case-insensitive', () => {
  expect(pickTrack([T('EN')], 'en')?.languageCode).toBe('EN')
})

// --- auto-generated (ASR) track selection ---

test('parseSelector understands the asr: prefix', () => {
  expect(parseSelector('en')).toEqual({ lang: 'en', asr: false })
  expect(parseSelector('asr:en')).toEqual({ lang: 'en', asr: true })
  expect(parseSelector('zh-Hant')).toEqual({ lang: 'zh-hant', asr: false })
})

test('asr: selector picks the auto-generated track', () => {
  const tracks = [T('en', 'English'), T('en', 'English (auto-generated)', 'asr')]
  expect(pickTrack(tracks, 'asr:en')?.kind).toBe('asr')
  expect(pickTrack(tracks, 'asr:en')?.name).toBe('English (auto-generated)')
})

test('plain selector prefers the human (non-asr) track when both exist', () => {
  const tracks = [T('en', 'English (auto-generated)', 'asr'), T('en', 'English')]
  expect(pickTrack(tracks, 'en')?.kind).toBeUndefined()
})

test('plain selector falls back to the asr track on an asr-only video', () => {
  const tracks = [T('en', 'English (auto-generated)', 'asr')]
  expect(pickTrack(tracks, 'en')?.kind).toBe('asr') // still shows captions
})

test('asr: selector falls back to whatever exists when there is no asr track', () => {
  expect(pickTrack([T('en', 'English')], 'asr:en')?.languageCode).toBe('en')
})

test('selectorForTrack round-trips the asr marker', () => {
  expect(selectorForTrack(T('en'))).toBe('en')
  expect(selectorForTrack(T('en', 'auto', 'asr'))).toBe('asr:en')
})

// --- captureMatchesBox: which captured timedtext response feeds which box ---

test('plain selector accepts a human-track capture for its language', () => {
  expect(captureMatchesBox('en', T('en'), 'en', false)).toBe(true)
})

test('plain selector ALSO accepts an asr capture for its language', () => {
  // Regression (subs empty after SPA nav until CC toggle): the video has both `en`
  // and `en:asr`, so `want` resolves to the human track — but right after a nav the
  // player briefly delivers only `en:asr`. That capture must still feed the box.
  expect(captureMatchesBox('en', T('en'), 'en', true)).toBe(true)
})

test('asr: selector requires the auto track and rejects the human capture', () => {
  expect(captureMatchesBox('asr:en', T('en', undefined, 'asr'), 'en', true)).toBe(true)
  expect(captureMatchesBox('asr:en', T('en', undefined, 'asr'), 'en', false)).toBe(false)
})

test('a capture in a different language never feeds the box', () => {
  expect(captureMatchesBox('en', T('en'), 'es', false)).toBe(false)
  // 'zh-Hant' resolved to the generic 'zh' track; a 'zh-CN' capture is a different track.
  expect(captureMatchesBox('zh-Hant', T('zh'), 'zh-CN', false)).toBe(false)
})

test('capture language match is case-insensitive', () => {
  expect(captureMatchesBox('en', T('en'), 'EN', false)).toBe(true)
  expect(captureMatchesBox('en', T('EN'), 'en', false)).toBe(true)
})

test('kind handling is language-agnostic — asr works for any language, not just en', () => {
  // A plain selector accepts ITS language's asr capture (ja, zh, es, …), same as en.
  expect(captureMatchesBox('ja', T('ja'), 'ja', true)).toBe(true)
  expect(captureMatchesBox('zh-Hant', T('zh'), 'zh', true)).toBe(true) // 'zh-Hant' resolved to a 'zh' track
  // An explicit asr: selector still requires the auto track — in any language.
  expect(captureMatchesBox('asr:ja', T('ja', undefined, 'asr'), 'ja', true)).toBe(true)
  expect(captureMatchesBox('asr:ja', T('ja', undefined, 'asr'), 'ja', false)).toBe(false)
  // A box never grabs another language's asr (matching is per-language).
  expect(captureMatchesBox('ja', T('ja'), 'ko', true)).toBe(false)
})

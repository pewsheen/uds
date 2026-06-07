import { expect, test } from 'vitest'
import { pickTrack, parseSelector, selectorForTrack } from '../../src/core/track-select'

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

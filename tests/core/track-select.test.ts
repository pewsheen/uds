import { expect, test } from 'vitest'
import { pickTrack } from '../../src/core/track-select'

const T = (languageCode: string, name?: string) => ({ baseUrl: `https://yt/${languageCode}`, languageCode, name })

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

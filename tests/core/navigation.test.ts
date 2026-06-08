import { expect, test } from 'vitest'
import { parseWatchId, videoChanged } from '../../src/core/navigation'

test('parseWatchId reads the v param from a watch URL', () => {
  expect(parseWatchId('https://www.youtube.com/watch?v=abc123')).toBe('abc123')
  expect(parseWatchId('https://www.youtube.com/watch?v=abc123&t=42s')).toBe('abc123')
  expect(parseWatchId('https://www.youtube.com/watch?list=PL1&v=xY_-9z')).toBe('xY_-9z')
})

test('parseWatchId returns null off a watch page', () => {
  expect(parseWatchId('https://www.youtube.com/')).toBeNull()
  expect(parseWatchId('https://www.youtube.com/results?search_query=cats')).toBeNull()
  expect(parseWatchId('https://www.youtube.com/feed/subscriptions')).toBeNull()
})

test('parseWatchId reads the id from a youtu.be short link', () => {
  expect(parseWatchId('https://youtu.be/abc123')).toBe('abc123')
  expect(parseWatchId('https://youtu.be/abc123?t=10')).toBe('abc123')
})

test('parseWatchId reads the id from a /shorts/ url', () => {
  expect(parseWatchId('https://www.youtube.com/shorts/abc123')).toBe('abc123')
})

test('parseWatchId tolerates garbage input', () => {
  expect(parseWatchId('')).toBeNull()
  expect(parseWatchId('not a url')).toBeNull()
})

test('videoChanged is true only when the id actually differs', () => {
  expect(videoChanged('a', 'b')).toBe(true)
  expect(videoChanged('a', 'a')).toBe(false)
  expect(videoChanged(null, 'a')).toBe(true) // arriving on a video from a non-watch page
  expect(videoChanged('a', null)).toBe(false) // leaving a video → don't tear down / reload
  expect(videoChanged(null, null)).toBe(false)
})

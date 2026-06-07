import type { Track } from './types'

export function buildTimedTextUrl(track: Track, tlang: string): string {
  const url = new URL(track.baseUrl)
  url.searchParams.set('tlang', tlang)
  url.searchParams.set('fmt', 'srv1')
  return url.toString()
}

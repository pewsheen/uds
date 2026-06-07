import type { CaptionTrack } from './types'

// Pick the caption track to show for a requested language. An exact `languageCode`
// match wins; otherwise fall back to the primary subtag so 'zh-Hant' can match a
// 'zh-*' track and 'en' can match 'en-US'. Returns null when the video offers no
// track for that language (the box then stays empty — we never auto-translate).
export function pickTrack(tracks: CaptionTrack[], lang: string): CaptionTrack | null {
  if (!lang) return null
  const want = lang.toLowerCase()
  const exact = tracks.find((t) => t.languageCode.toLowerCase() === want)
  if (exact) return exact
  const primary = want.split('-')[0]
  return tracks.find((t) => t.languageCode.toLowerCase().split('-')[0] === primary) ?? null
}

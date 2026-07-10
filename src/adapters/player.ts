import type { DisplayMode, Rect } from '../core/types'

export type Player = {
  video: () => HTMLVideoElement | null
  playerRect: () => Rect
  currentTime: () => number
  clockReady: () => boolean
  displayMode: () => DisplayMode
  fullscreenEl: () => Element | null
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

function areaOf(el: Element): number {
  const r = el.getBoundingClientRect()
  return r.width * r.height
}

function dataNumber(video: HTMLVideoElement, key: string): number | null {
  const raw = video.getAttribute?.(`data-dual-subs-${key}`)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function durationOf(video: HTMLVideoElement): number {
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  return duration > 0 ? duration : dataNumber(video, 'duration') ?? 0
}

function readyStateOf(video: HTMLVideoElement): number {
  return Math.max(video.readyState, dataNumber(video, 'ready-state') ?? 0)
}

function videoScore(video: HTMLVideoElement): number {
  const duration = durationOf(video)
  const readyState = readyStateOf(video)
  return (video.classList.contains('html5-main-video') ? 1000 : 0)
    + (readyState >= 2 ? 250 : readyState > 0 ? 125 : 0)
    + (duration > 0 ? 150 : 0)
    + (video.currentSrc ? 50 : 0)
    + (!video.paused ? 25 : 0)
    + Math.min(areaOf(video) / 10000, 50)
}

function isPrimeHost(doc: Document): boolean {
  return doc.location?.hostname.endsWith('primevideo.com') ?? false
}

function isPrimePlaybackVideo(video: HTMLVideoElement): boolean {
  return areaOf(video) > 1
    && readyStateOf(video) >= 2
    && durationOf(video) > 120
    && (!video.paused || video.currentTime > 0)
}

function bestBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null
  let bestScore = -Infinity
  for (const item of items) {
    const nextScore = score(item)
    if (nextScore > bestScore) {
      best = item
      bestScore = nextScore
    }
  }
  return best
}

export function createPlayerAdapter(doc: Document = document): Player {
  const prime = isPrimeHost(doc)
  const videos = () => Array.from(doc.querySelectorAll<HTMLVideoElement>('video.html5-main-video, video'))
  const findPrimeVideo = () => bestBy(videos().filter(isPrimePlaybackVideo), videoScore)
  const findVideo = () => prime ? findPrimeVideo() : bestBy(videos(), videoScore)
  const findVisibleVideo = () => bestBy(videos(), areaOf)
  const findPlayer = () => doc.querySelector('#movie_player, .html5-video-player, #dv-web-player, [data-testid="web-player"], [class*="webPlayer" i]')
  return {
    video: findVideo,
    playerRect: () => {
      // Prime's outer web-player container is often viewport-sized. Anchor to the
      // actual video so subtitles and the drag glow follow its playback surface.
      const p = prime
        ? findPrimeVideo() ?? findVisibleVideo()
        : findPlayer() ?? findVisibleVideo() ?? findVideo()
      return p ? rectOf(p) : { x: 0, y: 0, width: 0, height: 0 }
    },
    currentTime: () => findVideo()?.currentTime ?? 0,
    clockReady: () => !prime || findPrimeVideo() !== null,
    displayMode: () => {
      if (doc.fullscreenElement) return 'fullscreen'
      const body = doc.body
      if (body.classList.contains('ytd-miniplayer') || doc.querySelector('ytd-miniplayer[active]')) return 'miniplayer'
      if (doc.querySelector('ytd-watch-flexy[theater]')) return 'theater'
      return 'default'
    },
    fullscreenEl: () => doc.fullscreenElement,
  }
}

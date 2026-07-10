import type { DisplayMode, Rect } from '../core/types'

export type Player = {
  video: () => HTMLVideoElement | null
  playerRect: () => Rect
  currentTime: () => number
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

function videoScore(video: HTMLVideoElement): number {
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  return (video.classList.contains('html5-main-video') ? 1000 : 0)
    + (video.readyState >= 2 ? 250 : video.readyState > 0 ? 125 : 0)
    + (duration > 0 ? 150 : 0)
    + (video.currentSrc ? 50 : 0)
    + (!video.paused ? 25 : 0)
    + Math.min(areaOf(video) / 10000, 50)
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
  const videos = () => Array.from(doc.querySelectorAll<HTMLVideoElement>('video.html5-main-video, video'))
  const findVideo = () => bestBy(videos(), videoScore)
  const findVisibleVideo = () => bestBy(videos(), areaOf)
  const findPlayer = () => doc.querySelector('#movie_player, .html5-video-player, #dv-web-player, [data-testid="web-player"], [class*="webPlayer" i]')
  return {
    video: findVideo,
    playerRect: () => {
      const p = findPlayer() ?? findVisibleVideo() ?? findVideo()
      return p ? rectOf(p) : { x: 0, y: 0, width: 0, height: 0 }
    },
    currentTime: () => findVideo()?.currentTime ?? 0,
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

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

export function createPlayerAdapter(doc: Document = document): Player {
  const findVideo = () => doc.querySelector<HTMLVideoElement>('video.html5-main-video, video')
  const findPlayer = () => doc.querySelector('#movie_player, .html5-video-player')
  return {
    video: findVideo,
    playerRect: () => {
      const p = findPlayer() ?? findVideo()
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

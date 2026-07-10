import { expect, test } from 'vitest'
import { createPlayerAdapter } from '../../src/adapters/player'

type FakeVideoOptions = {
  classes?: string[]
  currentSrc?: string
  currentTime?: number
  duration?: number
  height?: number
  paused?: boolean
  readyState?: number
  width?: number
}

function fakeVideo(options: FakeVideoOptions): HTMLVideoElement {
  return {
    classList: { contains: (name: string) => options.classes?.includes(name) ?? false },
    currentSrc: options.currentSrc ?? '',
    currentTime: options.currentTime ?? 0,
    duration: options.duration ?? Number.NaN,
    paused: options.paused ?? true,
    readyState: options.readyState ?? 0,
    getBoundingClientRect: () => ({
      bottom: options.height ?? 0,
      height: options.height ?? 0,
      left: 0,
      right: options.width ?? 0,
      top: 0,
      width: options.width ?? 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLVideoElement
}

function fakeDocument(videoEls: HTMLVideoElement[]): Document {
  return {
    body: { classList: { contains: () => false } },
    fullscreenElement: null,
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector.includes('video') ? videoEls : [],
  } as unknown as Document
}

test('uses the loaded Prime media element for current time, not the visible placeholder video', () => {
  const placeholder = fakeVideo({
    currentSrc: 'blob:placeholder',
    currentTime: 0,
    height: 620,
    readyState: 0,
    width: 1102,
  })
  const active = fakeVideo({
    currentSrc: 'blob:active',
    currentTime: 151.849,
    duration: 1470.976,
    readyState: 4,
  })

  const player = createPlayerAdapter(fakeDocument([placeholder, active]))

  expect(player.currentTime()).toBe(151.849)
  expect(player.playerRect()).toEqual({ x: 0, y: 0, width: 1102, height: 620 })
})

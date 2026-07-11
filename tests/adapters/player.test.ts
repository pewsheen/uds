import { expect, test } from "vitest";
import { createPlayerAdapter } from "../../src/adapters/player";

type FakeVideoOptions = {
  classes?: string[];
  currentSrc?: string;
  currentTime?: number;
  duration?: number;
  height?: number;
  paused?: boolean;
  readyState?: number;
  width?: number;
  x?: number;
  y?: number;
};

function fakeVideo(options: FakeVideoOptions): HTMLVideoElement {
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const width = options.width ?? 0;
  const height = options.height ?? 0;
  return {
    classList: {
      contains: (name: string) => options.classes?.includes(name) ?? false,
    },
    currentSrc: options.currentSrc ?? "",
    currentTime: options.currentTime ?? 0,
    duration: options.duration ?? Number.NaN,
    paused: options.paused ?? true,
    readyState: options.readyState ?? 0,
    getBoundingClientRect: () => ({
      bottom: y + height,
      height,
      left: x,
      right: x + width,
      top: y,
      width,
      x,
      y,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLVideoElement;
}

function fakeDocument(
  videoEls: HTMLVideoElement[],
  hostname = "www.youtube.com",
  playerEl: Element | null = null,
): Document {
  return {
    body: { classList: { contains: () => false } },
    fullscreenElement: null,
    location: { hostname },
    querySelector: (selector: string) =>
      selector.includes("player") ? playerEl : null,
    querySelectorAll: (selector: string) =>
      selector.includes("video") ? videoEls : [],
  } as unknown as Document;
}

test("uses the loaded media element for current time, not a visible placeholder video", () => {
  const placeholder = fakeVideo({
    currentSrc: "blob:placeholder",
    currentTime: 0,
    height: 620,
    readyState: 0,
    width: 1102,
  });
  const active = fakeVideo({
    currentSrc: "blob:active",
    currentTime: 151.849,
    duration: 1470.976,
    readyState: 4,
  });

  const player = createPlayerAdapter(fakeDocument([placeholder, active]));

  expect(player.clockReady()).toBe(true);
  expect(player.currentTime()).toBe(151.849);
  expect(player.playerRect()).toEqual({ x: 0, y: 0, width: 1102, height: 620 });
});

test("waits for a visible Prime playback timeline instead of the detail-page preview", () => {
  const preview = fakeVideo({
    currentSrc: "blob:preview",
    currentTime: 57.94,
    duration: 81.081,
    height: 630,
    paused: false,
    readyState: 4,
    width: 1151,
  });
  const hiddenPlayback = fakeVideo({
    currentSrc: "blob:playback",
    currentTime: 632.849,
    duration: 1470.976,
    paused: true,
    readyState: 4,
  });

  const player = createPlayerAdapter(
    fakeDocument([preview, hiddenPlayback], "www.primevideo.com"),
  );

  expect(player.clockReady()).toBe(false);
  expect(player.currentTime()).toBe(0);
  expect(player.playerRect()).toEqual({ x: 0, y: 0, width: 1151, height: 630 });
});

test("uses the visible Prime playback video once the player is active", () => {
  const playback = fakeVideo({
    currentSrc: "blob:playback",
    currentTime: 632.849,
    duration: 1470.976,
    height: 630,
    paused: false,
    readyState: 4,
    width: 1100,
    x: 40,
    y: 25,
  });
  const fullscreenPlayer = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
    }),
  } as unknown as Element;

  const player = createPlayerAdapter(
    fakeDocument([playback], "www.primevideo.com", fullscreenPlayer),
  );

  expect(player.clockReady()).toBe(true);
  expect(player.currentTime()).toBe(632.849);
  expect(player.playerRect()).toEqual({
    x: 40,
    y: 25,
    width: 1100,
    height: 630,
  });
});

import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../../dist");

const htmlPath = path.resolve(here, "fixtures/fake-youtube.html");
const primeHtmlPath = path.resolve(here, "fixtures/fake-prime.html");
const json3Path = path.resolve(here, "fixtures/timedtext.json3");

type RuntimeContext = { origin?: string; name?: string };

async function extensionIdFromContentScript(
  page: import("@playwright/test").Page,
): Promise<string> {
  const session = await context.newCDPSession(page);
  const contexts: RuntimeContext[] = [];
  session.on(
    "Runtime.executionContextCreated",
    (event: { context: RuntimeContext }) => contexts.push(event.context),
  );
  await session.send("Runtime.enable");
  try {
    for (let i = 0; i < 20; i++) {
      const origin =
        contexts.find(
          (c) =>
            c.name === "YouTube Dual Subtitles" &&
            c.origin?.startsWith("chrome-extension://"),
        )?.origin ??
        contexts.find((c) => c.origin?.startsWith("chrome-extension://"))
          ?.origin;
      if (origin) return new URL(origin).host;
      await page.waitForTimeout(100);
    }
    throw new Error("Could not find the extension content-script context");
  } finally {
    await session.detach().catch(() => {});
  }
}

let context: BrowserContext;

test.beforeAll(async () => {
  // Extensions only load in the full (non-shell) Chromium. The default `headless: true`
  // uses the lightweight headless-shell which silently ignores --load-extension; the
  // `chromium` channel uses the full browser whose new headless mode supports extensions.
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
});
test.afterAll(async () => {
  await context.close();
});

// Serve the fixture page AS a youtube.com/watch document so the content-script match
// pattern (https://www.youtube.com/*) fires, and serve the fixture json3 for the
// caption fetches the fixture makes (which the bridge captures and forwards).
async function routeFixtures(page: import("@playwright/test").Page) {
  await page.route("https://www.youtube.com/watch*", async (route) => {
    const html = await readFile(htmlPath, "utf8");
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.route("**/api/timedtext**", async (route) => {
    const json = await readFile(json3Path, "utf8");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: json,
    });
  });
}

test("injects, renders both boxes, syncs, drags", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // Chromium injects content scripts based on the committed document URL, not how
  // the body arrived.
  await routeFixtures(page);

  await page.goto("https://www.youtube.com/watch?v=fixture");

  const layer = page.locator("#dual-subs-layer");
  await expect(layer).toBeAttached({ timeout: 10000 });
  expect(errors, errors.join("\n")).toHaveLength(0);

  const boxes = page.locator(".dual-subs-box");
  await expect(boxes).toHaveCount(2);

  // Sync: at t=1 the first cue is active in both independently loaded boxes.
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(boxes.first()).toContainText("Hello from the fixture");
  await expect(boxes.last()).toContainText("Hello from the fixture");
  const firstRect = await boxes.first().boundingBox();
  const secondRect = await boxes.last().boundingBox();
  expect(firstRect).not.toBeNull();
  expect(secondRect).not.toBeNull();
  expect(
    firstRect!.y + firstRect!.height <= secondRect!.y ||
      secondRect!.y + secondRect!.height <= firstRect!.y,
  ).toBe(true);

  // Sync: at t=4 the second cue is active.
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(4),
  );
  await expect(boxes.first()).toContainText("Second line of text");

  // Drag the second box to a point clearly OUTSIDE the player rect and assert its anchor flips to 'page'.
  const draggable = boxes.last();
  const player = page.locator("#movie_player");
  const playerBox = await player.boundingBox();
  expect(playerBox).not.toBeNull();
  const before = await draggable.boundingBox();
  expect(before).not.toBeNull();

  // Both boxes start anchored to the video.
  await expect(draggable).toHaveAttribute("data-anchor", "video");

  // Target (2,2): above-left of the player rect (player starts ~ (28,20) due to margins),
  // so resolveAnchor() classifies the drop as outside the player → 'page'.
  expect(playerBox!.x).toBeGreaterThan(2);
  expect(playerBox!.y).toBeGreaterThan(2);

  await page.mouse.move(before!.x + 5, before!.y + 5);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();

  await expect(draggable).toHaveAttribute("data-anchor", "page");
});

test("one failing caption track does not tear down the whole overlay", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.route("https://www.youtube.com/watch*", async (route) => {
    const html = await readFile(htmlPath, "utf8");
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  // The English track succeeds; the zh-Hant track is rate-limited (429).
  // A single failing track must NOT tear down the whole overlay (its body parses
  // to zero cues, so that box just stays empty).
  await page.route("**/api/timedtext**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("lang") === "zh-Hant") {
      await route.fulfill({
        status: 429,
        contentType: "text/plain",
        body: "rate limited",
      });
      return;
    }
    const json = await readFile(json3Path, "utf8");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: json,
    });
  });

  await page.goto("https://www.youtube.com/watch?v=fixture");

  // The overlay still mounts: layer + BOTH boxes present despite the 429.
  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });
  await expect(page.locator(".dual-subs-box")).toHaveCount(2);
  // The 429 is swallowed per-box, not surfaced as an unhandled rejection.
  expect(errors, errors.join("\n")).toHaveLength(0);

  // The surviving track still renders its cue.
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(page.locator(".dual-subs-box").first()).toContainText(
    "Hello from the fixture",
  );
});

test("SPA navigation to a new video swaps captions without a page reload", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.route("https://www.youtube.com/watch*", async (route) => {
    const html = await readFile(htmlPath, "utf8");
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  // Serve distinct caption text per video so we can prove the SWAP happened, not just
  // that some text rendered. video2's first cue is unmistakably different.
  await page.route("**/api/timedtext**", async (route) => {
    const v = new URL(route.request().url()).searchParams.get("v");
    const body =
      v === "video2"
        ? '{"events":[{"tStartMs":0,"dDurationMs":9000,"segs":[{"utf8":"Second video caption"}]}]}'
        : await readFile(json3Path, "utf8");
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });

  await page.goto("https://www.youtube.com/watch?v=fixture");

  const firstBox = page.locator(".dual-subs-box").first();
  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });

  // First video renders its caption.
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(firstBox).toContainText("Hello from the fixture");

  // Navigate to a different video the way YouTube does — no document reload.
  await page.evaluate(() =>
    (window as unknown as { __navigate: (id: string) => void }).__navigate(
      "video2",
    ),
  );

  // The box must pick up the NEW video's caption on its own (no reload, no CC toggle).
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(firstBox).toContainText("Second video caption", {
    timeout: 10000,
  });
  // And the previous video's text must be gone.
  await expect(firstBox).not.toContainText("Hello from the fixture");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("re-parents the subtitle layer into the fullscreen element on fullscreen", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await routeFixtures(page);
  await page.goto("https://www.youtube.com/watch?v=fixture");

  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });
  expect(errors, errors.join("\n")).toHaveLength(0);

  // 1. Initially the layer is a direct child of <body>.
  await expect(page.locator("body > #dual-subs-layer")).toBeAttached();

  // 2. Enter real fullscreen via a user gesture, then wait for the browser to report it.
  await page.click("#go-fs");
  await page.waitForFunction(() => !!document.fullscreenElement, null, {
    timeout: 5000,
  });

  // 3. The rAF render loop should re-parent the layer under #movie_player.
  await expect(page.locator("#movie_player #dual-subs-layer")).toBeAttached({
    timeout: 5000,
  });

  // 4. Exit fullscreen and assert it returns under <body>.
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement, null, {
    timeout: 5000,
  });
  await expect(page.locator("body > #dual-subs-layer")).toBeAttached({
    timeout: 5000,
  });
});

test("re-selecting a box source (off → on) re-fills it without a reload", async () => {
  const page = await context.newPage();
  await routeFixtures(page);
  await page.goto("https://www.youtube.com/watch?v=fixture");

  const box0 = page.locator(".dual-subs-box").first();
  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(box0).toContainText("Hello from the fixture");

  // Drive the REAL popup → chrome.storage → the content script's storage.onChanged,
  // exactly as the user does when they change a box's source in the popup.
  const id = await extensionIdFromContentScript(page);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await expect(popup.locator("#enabled")).toBeAttached();

  const STYLE = {
    fontSizePx: 24,
    color: "#ffffff",
    bgColor: "#000000",
    bgOpacity: 0.55,
    fontFamily: "system-ui",
    outline: true,
  };
  const base = {
    enabled: true,
    nativeSubtitles: false,
    boxes: [
      { id: "sub1", lang: "en", style: STYLE },
      { id: "sub2", lang: "zh-Hant", style: STYLE },
    ],
  };
  const setLang0 = (l: string) =>
    popup.evaluate(
      async ({ l, base }) => {
        const got = (await chrome.storage.sync.get("dualSubsSettings")) as {
          dualSubsSettings?: typeof base;
        };
        const s = got.dualSubsSettings ?? base;
        s.boxes[0]!.lang = l;
        await chrome.storage.sync.set({ dualSubsSettings: s });
      },
      { l, base },
    );

  await setLang0(""); // source OFF: box clears
  await expect(box0).not.toContainText("Hello", { timeout: 5000 });
  await setLang0("en"); // source back ON
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(box0).toContainText("Hello from the fixture", { timeout: 5000 }); // refills — no reload, no CC toggle

  await popup.evaluate(() => chrome.storage.sync.clear()); // don't leak settings into other tests
  await popup.close();
  await page.close();
});

test("refresh with default-on captions refetches a single already-selected track", async () => {
  const page = await context.newPage();
  await page.route("https://www.youtube.com/watch*", async (route) => {
    const html = await readFile(htmlPath, "utf8");
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });

  let emptied = false;
  await page.route("**/api/timedtext**", async (route) => {
    const lang = new URL(route.request().url()).searchParams.get("lang");
    if (lang === "en" && !emptied) {
      emptied = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "",
      });
      return;
    }
    const json = await readFile(json3Path, "utf8");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: json,
    });
  });

  await page.goto("https://www.youtube.com/watch?v=fixture&singleTrack=1");

  const box0 = page.locator(".dual-subs-box").first();
  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });
  await expect(page.locator(".ytp-subtitles-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(box0).toContainText("Hello from the fixture", {
    timeout: 15000,
  });
});

test("Prime Video detail page discovers subtitle tracks and renders fetched captions", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.route(
    /https:\/\/(?:www|fe)\.primevideo\.com\/(?:region\/[^/]+\/)?detail\/.*/,
    async (route) => {
      const html = await readFile(primeHtmlPath, "utf8");
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: html,
      });
    },
  );
  await page.route(
    "https://fe.primevideo.com/playback/GetPlaybackResources**",
    async (route) => {
      const titleId =
        new URL(route.request().url()).searchParams.get("titleId") ??
        "prime-fixture";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          titleId,
          subtitleUrls: [
            {
              timedTextTrackId: "en-track",
              url: `https://fe.primevideo.com/subtitles/${titleId}/en-US.vtt?sig=fixture`,
            },
            {
              timedTextTrackId: "zh-track",
              url: `https://fe.primevideo.com/subtitles/${titleId}/zh-Hant.ttml2?sig=fixture`,
            },
          ],
          subtitleMetadata: {
            timedTextTracks: [
              {
                timedTextTrackId: "en-track",
                languageCode: "en-US",
                displayName: "English",
              },
              {
                timedTextTrackId: "zh-track",
                languageCode: "zh-Hant",
                displayName: "Chinese Traditional",
              },
            ],
          },
        }),
      });
    },
  );
  await page.route(
    "https://fe.primevideo.com/subtitles/**/en-US.vtt**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/vtt",
        body: "WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nPrime English caption",
      });
    },
  );
  await page.route(
    "https://fe.primevideo.com/subtitles/**/zh-Hant.ttml2**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/ttml+xml",
        body: '<tt><body><div><p begin="0s" end="9s">Prime Chinese caption</p></div></body></tt>',
      });
    },
  );

  await page.goto(
    "https://fe.primevideo.com/region/fe/detail/0SS3O1MC4E0TW4GF0V1E4KD06T?ref_=atv_plr_landingpage_play",
  );

  const boxes = page.locator(".dual-subs-box");
  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });
  await expect(boxes).toHaveCount(2);
  await page.evaluate(() =>
    (window as unknown as { __setTime: (t: number) => void }).__setTime(1),
  );
  await expect(boxes.first()).toContainText("Prime English caption", {
    timeout: 10000,
  });
  await expect(boxes.last()).toContainText("Prime Chinese caption", {
    timeout: 10000,
  });

  const firstBox = boxes.first();
  const box = await firstBox.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, 10);
  await expect(firstBox).toHaveAttribute("data-anchor", "video");
  const glow = page.locator("#dual-subs-glow");
  await expect(glow).toBeVisible();
  const glowBox = await glow.boundingBox();
  const videoBox = await page.locator("video").boundingBox();
  const playerBox = await page.locator("#dv-web-player").boundingBox();
  expect(glowBox).toEqual(videoBox);
  expect(glowBox).not.toEqual(playerBox);
  await page.mouse.up();
  await expect(firstBox).toHaveAttribute("data-anchor", "video");

  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("Prime Video native-caption preference hides the native layer or enables the first configured language", async () => {
  const page = await context.newPage();
  await page.route(
    /https:\/\/(?:www|fe)\.primevideo\.com\/(?:region\/[^/]+\/)?detail\/.*/,
    async (route) => {
      const html = await readFile(primeHtmlPath, "utf8");
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: html,
      });
    },
  );
  await page.route(
    "https://fe.primevideo.com/playback/GetPlaybackResources**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          titleId: "prime-native-fixture",
          subtitleUrls: [
            {
              timedTextTrackId: "en-track",
              url: "https://fe.primevideo.com/subtitles/native/en-US.vtt",
            },
          ],
          subtitleMetadata: {
            timedTextTracks: [
              {
                timedTextTrackId: "en-track",
                languageCode: "en-US",
                displayName: "English",
              },
            ],
          },
        }),
      });
    },
  );
  await page.route(
    "https://fe.primevideo.com/subtitles/native/en-US.vtt",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/vtt",
        body: "WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nPrime English caption",
      });
    },
  );

  await page.goto(
    "https://fe.primevideo.com/region/fe/detail/0SS3O1MC4E0TW4GF0V1E4KD06T",
  );
  await expect(page.locator("#dual-subs-layer")).toBeAttached({
    timeout: 10000,
  });

  const id = await extensionIdFromContentScript(page);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await expect(popup.locator("#native")).toBeAttached();
  const nativeToggle = popup.locator("label.check:has(#native)");
  if (await popup.locator("#native").isChecked()) {
    await nativeToggle.click();
  }

  const nativeOverlay = page.locator(".atvwebplayersdk-captions-overlay");
  await expect(nativeOverlay).toHaveCSS("display", "none");

  await nativeToggle.click();
  await expect(page.locator("#en-us_Subtitle_Dialog_1")).toBeChecked({
    timeout: 5000,
  });
  await expect(nativeOverlay).toBeVisible();
  await expect(nativeOverlay).toContainText("Native en-us");

  await popup.evaluate(() => chrome.storage.sync.clear());
  await popup.close();
  await page.close();
});

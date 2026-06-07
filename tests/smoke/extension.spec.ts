import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const htmlPath = path.resolve(here, 'fixtures/fake-youtube.html')
const xmlPath = path.resolve(here, 'fixtures/timedtext.xml')

let context: BrowserContext

test.beforeAll(async () => {
  // Extensions only load in the full (non-shell) Chromium. The default `headless: true`
  // uses the lightweight headless-shell which silently ignores --load-extension; the
  // `chromium` channel uses the full browser whose new headless mode supports extensions.
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
})
test.afterAll(async () => { await context.close() })

// Serve the fixture page AS a youtube.com/watch document so the content-script
// match pattern (https://www.youtube.com/*) actually fires, and serve the fixture
// XML for both subtitle boxes' timedtext fetches.
async function routeFixtures(page: import('@playwright/test').Page) {
  await page.route('https://www.youtube.com/watch*', async (route) => {
    const html = await readFile(htmlPath, 'utf8')
    await route.fulfill({ status: 200, contentType: 'text/html', body: html })
  })
  await page.route('**/api/timedtext**', async (route) => {
    const xml = await readFile(xmlPath, 'utf8')
    await route.fulfill({ status: 200, contentType: 'text/xml', body: xml })
  })
}

test('injects, renders both boxes, syncs, drags', async () => {
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  // Chromium injects content scripts based on the committed document URL, not how
  // the body arrived.
  await routeFixtures(page)

  await page.goto('https://www.youtube.com/watch?v=fixture')

  const layer = page.locator('#dual-subs-layer')
  await expect(layer).toBeAttached({ timeout: 10000 })
  expect(errors, errors.join('\n')).toHaveLength(0)

  const boxes = page.locator('.dual-subs-box')
  await expect(boxes).toHaveCount(2)

  // Sync: at t=1 the first cue is active.
  await page.evaluate(() => (window as unknown as { __setTime: (t: number) => void }).__setTime(1))
  await expect(boxes.first()).toContainText('Hello from the fixture')

  // Sync: at t=4 the second cue is active.
  await page.evaluate(() => (window as unknown as { __setTime: (t: number) => void }).__setTime(4))
  await expect(boxes.first()).toContainText('Second line of text')

  // Both boxes share the same default position and overlap exactly, so the LAST box
  // (sub2) is the one on top and the one that actually receives pointer events. Drag it
  // to a point clearly OUTSIDE the player rect and assert its anchor flips to 'page'.
  const draggable = boxes.last()
  const player = page.locator('#movie_player')
  const playerBox = await player.boundingBox()
  expect(playerBox).not.toBeNull()
  const before = await draggable.boundingBox()
  expect(before).not.toBeNull()

  // Both boxes start anchored to the video.
  await expect(draggable).toHaveAttribute('data-anchor', 'video')

  // Target (2,2): above-left of the player rect (player starts ~ (28,20) due to margins),
  // so resolveAnchor() classifies the drop as outside the player → 'page'.
  expect(playerBox!.x).toBeGreaterThan(2)
  expect(playerBox!.y).toBeGreaterThan(2)

  await page.mouse.move(before!.x + 5, before!.y + 5)
  await page.mouse.down()
  await page.mouse.move(2, 2)
  await page.mouse.up()

  await expect(draggable).toHaveAttribute('data-anchor', 'page')
})

test('re-parents the subtitle layer into the fullscreen element on fullscreen', async () => {
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await routeFixtures(page)
  await page.goto('https://www.youtube.com/watch?v=fixture')

  await expect(page.locator('#dual-subs-layer')).toBeAttached({ timeout: 10000 })
  expect(errors, errors.join('\n')).toHaveLength(0)

  // 1. Initially the layer is a direct child of <body>.
  await expect(page.locator('body > #dual-subs-layer')).toBeAttached()

  // 2. Enter real fullscreen via a user gesture, then wait for the browser to report it.
  await page.click('#go-fs')
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 })

  // 3. The rAF render loop should re-parent the layer under #movie_player.
  await expect(page.locator('#movie_player #dual-subs-layer')).toBeAttached({ timeout: 5000 })

  // 4. Exit fullscreen and assert it returns under <body>.
  await page.evaluate(() => document.exitFullscreen())
  await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 })
  await expect(page.locator('body > #dual-subs-layer')).toBeAttached({ timeout: 5000 })
})

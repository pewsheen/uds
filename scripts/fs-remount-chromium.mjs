// Live fullscreen-remount verification against the REAL youtube.com video,
// using Playwright's bundled Chromium (channel: 'chromium'), which still honors
// --load-extension (Google Chrome Stable 148 blocks that switch).
//
// Verifies: #dual-subs-layer is a child of <body> in normal mode, re-parents to
// become a child of document.fullscreenElement on FS enter, and returns under
// <body> on FS exit — on the real player, not a fixture.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.resolve('dist')
const VIDEO = 'https://www.youtube.com/watch?v=aircAruvnKk'
const SHOTS = path.resolve('scripts')
const TIMEDTEXT_XML = await readFile(path.resolve('tests/smoke/fixtures/timedtext.xml'), 'utf8')
const log = (...a) => console.log(...a)

function parentInfo() {
  const layer = document.getElementById('dual-subs-layer')
  if (!layer) return { layer: false }
  const p = layer.parentElement
  const fe = document.fullscreenElement
  const desc = (el) =>
    el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}` +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : null
  return {
    layer: true,
    boxes: document.querySelectorAll('.dual-subs-box').length,
    parent: desc(p),
    parentIsBody: p === document.body,
    fullscreenEl: desc(fe),
    parentIsFullscreenEl: !!fe && p === fe,
  }
}

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--start-maximized'],
})
try {
  // YouTube rate-limits (429) the real timedtext endpoint under repeated test runs,
  // and the net adapter aborts the whole overlay on any fetch failure. Serve the
  // fixture XML so both boxes mount deterministically — the real player, page, and
  // fullscreen behavior (what the remount fix touches) are still exercised.
  await ctx.route('**/api/timedtext**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/xml', body: TIMEDTEXT_XML }))

  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  log('Navigating to', VIDEO)
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded' })

  // Best-effort consent dismissal (EU/zh-TW interstitial).
  try {
    const reject = page.getByRole('button', { name: /reject all|拒絕全部|全部拒绝/i }).first()
    if (await reject.isVisible({ timeout: 2500 })) { await reject.click(); await page.waitForTimeout(1000) }
  } catch {}

  // Wait for the extension to inject the overlay layer.
  await page.waitForSelector('#dual-subs-layer', { state: 'attached', timeout: 25000 })
  await page.waitForTimeout(1200) // let the rAF loop settle + boxes mount
  log('Layer injected.')

  const before = await page.evaluate(parentInfo)
  log('BEFORE:', JSON.stringify(before))
  await page.screenshot({ path: path.join(SHOTS, 'fs-before.png') })

  // Enter fullscreen via trusted click on YouTube's fullscreen button.
  const fsBtn = page.locator('.ytp-fullscreen-button').first()
  await fsBtn.waitFor({ state: 'visible', timeout: 10000 })
  await fsBtn.click()
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 8000 })
  await page.waitForTimeout(1000)
  const during = await page.evaluate(parentInfo)
  log('DURING:', JSON.stringify(during))
  await page.screenshot({ path: path.join(SHOTS, 'fs-during.png') })

  // Exit fullscreen (programmatic; YouTube can swallow the Escape key).
  await page.evaluate(() => document.exitFullscreen?.())
  await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 8000 })
  await page.waitForTimeout(1000)
  const after = await page.evaluate(parentInfo)
  log('AFTER:', JSON.stringify(after))
  await page.screenshot({ path: path.join(SHOTS, 'fs-after.png') })

  const pass =
    before.layer && before.parentIsBody &&
    during.parentIsFullscreenEl &&
    after.parentIsBody
  log('\n==== RESULT ====')
  log('pageerrors                 :', errors.length, errors.slice(0, 3).join(' | '))
  log('before.parentIsBody        :', before.parentIsBody, '(parent:', before.parent + ')')
  log('during.parentIsFullscreenEl:', during.parentIsFullscreenEl, '(fsEl:', during.fullscreenEl + ', parent:', during.parent + ')')
  log('after.parentIsBody         :', after.parentIsBody, '(parent:', after.parent + ')')
  log(pass ? '✅ PASS — layer re-parents on FS enter and returns on exit (real player)'
           : '❌ FAIL — see snapshots above')
  process.exitCode = pass ? 0 : 1
} finally {
  await ctx.close()
}

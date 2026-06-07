// Validate the capture→parse→render pipeline on the REAL youtube.com player.
// We can't mint a valid pot in an automated browser, so we intercept timedtext and
// return real cues — proving that when the player fetches captions (which it does
// successfully in a real browser), the bridge captures them and our boxes render.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.resolve('dist')
const JSON3 = await readFile(path.resolve('tests/smoke/fixtures/timedtext.json3'), 'utf8')
const VIDEO = 'https://www.youtube.com/watch?v=tz23G_UXCGA'
const log = (...a) => console.log(...a)

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: false, viewport: null,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--start-maximized', '--autoplay-policy=no-user-gesture-required'],
})
try {
  // Feed real cues for ANY timedtext request (bypasses the poisoned-pot empty body).
  await ctx.route('**/api/timedtext**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON3 }))

  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded' })
  try {
    const r = page.getByRole('button', { name: /reject all|accept all|拒絕|接受|同意/i }).first()
    if (await r.isVisible({ timeout: 2500 })) { await r.click(); await page.waitForTimeout(800) }
  } catch {}

  await page.waitForSelector('#dual-subs-layer', { state: 'attached', timeout: 25000 })
  log('overlay layer injected')

  // Wait for the extension to auto-enable CC → player fetches timedtext → bridge
  // captures → cues populate. Poll the box text.
  let state = null
  for (let i = 0; i < 30; i++) {
    state = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.dual-subs-box')]
      return {
        ccPressed: document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed'),
        currentTime: document.querySelector('video')?.currentTime,
        boxes: boxes.map((b) => ({ text: b.textContent, display: b.style.display })),
      }
    })
    if (state.boxes.some((b) => b.text)) break
    await page.waitForTimeout(700)
  }
  log('state:', JSON.stringify(state, null, 2))
  await page.screenshot({ path: path.resolve('scripts/pipeline.png') })

  const ok = state?.boxes?.some((b) => b.text && b.text.includes('fixture'))
  log(ok ? '✅ PASS — player fetch captured and rendered in our box' : '❌ no rendered cue (see state above)')
  process.exitCode = ok ? 0 : 1
} finally {
  try { await ctx.close() } catch {}
}

// Validate dual-language capture (#5) on the user's test video: the extension must
// load EACH configured language through the player sequentially and fill BOTH boxes.
// We intercept timedtext and return distinct cues per language so we can tell them apart.
import { chromium } from '@playwright/test'
import path from 'node:path'

const DIST = path.resolve('dist')
const VIDEO = process.env.VIDEO_URL || 'https://www.youtube.com/watch?v=aircAruvnKk'
const log = (...a) => console.log(...a)

const json3 = (label) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 600000, segs: [{ utf8: label }] }] })

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: false, viewport: null,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--start-maximized', '--autoplay-policy=no-user-gesture-required'],
})
try {
  await ctx.route('**/api/timedtext**', (route) => {
    const u = new URL(route.request().url())
    const lang = u.searchParams.get('tlang') || u.searchParams.get('lang') || '?'
    route.fulfill({ status: 200, contentType: 'application/json', body: json3(`CUE[${lang}]`) })
  })

  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded' })
  try {
    const r = page.getByRole('button', { name: /reject all|accept all|拒絕|接受|同意/i }).first()
    if (await r.isVisible({ timeout: 2500 })) { await r.click(); await page.waitForTimeout(800) }
  } catch {}

  await page.waitForTimeout(6000)
  const pre = await page.evaluate(() => ({
    href: location.href,
    hasPR: !!window.ytInitialPlayerResponse,
    playability: window.ytInitialPlayerResponse?.playabilityStatus?.status,
    tracks: (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []).map((t) => t.languageCode),
    bridgeAttr: !!document.documentElement.getAttribute('data-dual-subs-pr'),
    layer: !!document.getElementById('dual-subs-layer'),
  }))
  log('PRE-CHECK:', JSON.stringify(pre, null, 2))

  let state = null
  for (let i = 0; i < 25; i++) {
    state = await page.evaluate(() => ({
      available: (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [])
        .map((t) => t.languageCode + (t.kind ? '/' + t.kind : '')),
      boxes: [...document.querySelectorAll('.dual-subs-box')].map((b) => b.textContent),
    }))
    if (state.boxes.filter((t) => t).length >= 2) break
    await page.waitForTimeout(800)
  }
  log('available tracks:', JSON.stringify(state.available))
  log('box texts:', JSON.stringify(state.boxes))
  await page.screenshot({ path: path.resolve('scripts/dual.png') })

  const filled = state.boxes.filter((t) => t && t.includes('CUE'))
  log(filled.length >= 2 ? '✅ PASS — both boxes filled (dual-language sequential load works)'
    : `⚠️ only ${filled.length} box(es) filled — check available tracks above`)
} finally {
  try { await ctx.close() } catch {}
}

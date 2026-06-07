// Validate the SPA-navigation fix on REAL youtube.com in bundled Chromium.
// Real caption bodies are pot-gated (empty 200) in automated browsers, so — like the
// other validate-*.mjs drivers — we route timedtext to a substituted json3 body whose
// cue text is stamped with the request's `v` (video id). That lets us prove, end to end:
//   1. clicking a different video (a true SPA nav, no document reload) refreshes the
//      bridge's published player response to the NEW video id  (was symptom #1: stale
//      track list), and
//   2. both boxes re-load captions for the new video on their own              (was
//      symptom #2: subs didn't show until CC toggle / reload).
import { chromium } from '@playwright/test'
import path from 'node:path'

const DIST = path.resolve('dist')
const VIDEO = 'https://www.youtube.com/watch?v=aircAruvnKk'
const log = (...a) => console.log(...a)
const json3 = (label) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 600000, segs: [{ utf8: label }] }] })

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: false, viewport: null,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--start-maximized', '--autoplay-policy=no-user-gesture-required'],
})

const videoIdOfAttr = () =>
  ctx.pages()[0].evaluate(() => {
    const raw = document.documentElement.getAttribute('data-dual-subs-pr')
    if (!raw) return null
    try { return JSON.parse(raw)?.videoDetails?.videoId ?? null } catch { return null }
  })

const boxText = () =>
  ctx.pages()[0].evaluate(() => [...document.querySelectorAll('.dual-subs-box')].map((b) => b.textContent))

async function waitFor(fn, label, ms = 25000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const v = await fn()
    if (v) return v
    await ctx.pages()[0].waitForTimeout(500)
  }
  throw new Error(`timeout waiting for: ${label}`)
}

try {
  // Stamp each captured caption with the request's video id so a swap is visible.
  await ctx.route('**/api/timedtext**', (route) => {
    const u = new URL(route.request().url())
    const v = u.searchParams.get('v') || '?'
    const lang = u.searchParams.get('tlang') || u.searchParams.get('lang') || '?'
    route.fulfill({ status: 200, contentType: 'application/json', body: json3(`CUE[v=${v} ${lang}]`) })
  })

  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded' })
  try {
    const r = page.getByRole('button', { name: /reject all|accept all|拒絕|接受|同意/i }).first()
    if (await r.isVisible({ timeout: 3000 })) { await r.click(); await page.waitForTimeout(800) }
  } catch {}

  // --- Video A ---
  await waitFor(async () => (await boxText()).some((t) => t && t.includes('CUE')), 'box A to fill')
  let prevId = await videoIdOfAttr()
  log('VIDEO A:', JSON.stringify({ idA: prevId, boxes: await boxText() }, null, 2))

  // Click a VISIBLE in-page link to a different watch video and return its id. A synthetic
  // anchor click triggers YouTube's SPA router — no document reload.
  async function spaNavigateAwayFrom(cur) {
    await page.evaluate(() => window.scrollTo(0, 700))
    return waitFor(async () =>
      page.evaluate((c) => {
        for (const a of document.querySelectorAll('a[href*="/watch?v="]')) {
          if (a.getAttribute('aria-hidden') === 'true') continue
          const r = a.getBoundingClientRect()
          if (r.width <= 0 || r.height <= 0) continue
          const id = new URL(a.href, location.origin).searchParams.get('v')
          if (id && id !== c) { a.scrollIntoView({ block: 'center' }); a.click(); return id }
        }
        return null
      }, cur), 'a visible recommended video link', 15000)
  }

  // Each SPA navigation must: stay in-page (marker survives), re-publish the bridge attr
  // to the new video id (symptom #1), clear the previous video's cues, and re-load this
  // video's captions on its own (symptom #2). A random recommendation may lack an en/
  // zh-Hant track, so retry across a few real recommendations until one fills — every
  // hop is itself a real SPA nav, so this also proves repeated navigation works.
  let captionsReloaded = false
  let navsVerified = 0
  for (let hop = 1; hop <= 4 && !captionsReloaded; hop++) {
    await page.evaluate(() => { window.__spaMarker = 'kept' }) // wiped by a full reload, kept by SPA
    const id = await spaNavigateAwayFrom(prevId)
    log(`hop ${hop}: SPA nav →`, id)

    await waitFor(async () => (await page.evaluate(() => new URLSearchParams(location.search).get('v'))) === id, 'url switch')
    const wasSpa = await page.evaluate(() => window.__spaMarker === 'kept')
    const attr = await waitFor(async () => ((await videoIdOfAttr()) === id ? id : null), 'bridge attr republish')
    const clearedOld = !(await boxText()).some((t) => t && t.includes(`v=${prevId}`))
    let filled = false
    try { await waitFor(async () => ((await boxText()).some((t) => t && t.includes(`v=${id}`)) ? true : null), 'captions reload', 14000); filled = true } catch {}

    log(`  wasSpa=${wasSpa} attrRepublished=${attr === id} clearedOldCues=${clearedOld} captionsReloaded=${filled} boxes=${JSON.stringify(await boxText())}`)
    if (wasSpa && attr === id && clearedOld) navsVerified++
    if (filled) captionsReloaded = true
    prevId = id
  }

  await page.screenshot({ path: path.resolve('scripts/nav.png') })
  const pass = navsVerified >= 1 && captionsReloaded
  log(pass
    ? `✅ PASS — ${navsVerified} SPA nav(s) refreshed the bridge + cleared old cues, and captions reloaded for the new video (no reload, no CC toggle)`
    : `❌ FAIL — navsVerified=${navsVerified} captionsReloaded=${captionsReloaded}`)
  process.exitCode = pass ? 0 : 1
} catch (e) {
  log('❌ ERROR:', e.message)
  try { await ctx.pages()[0].screenshot({ path: path.resolve('scripts/nav-error.png') }) } catch {}
  process.exitCode = 1
} finally {
  try { await ctx.close() } catch {}
}

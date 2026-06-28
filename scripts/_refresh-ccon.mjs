// Repro "captions default on → empty until manual toggle", deterministic on a real player.
// Conditions: CC on at load (cc_load_policy=1) so the player auto-fetches en; the first en
// fetch comes back empty (simulated pot miss) and is dropped; and box1 is OFF so there is
// no second language to make the player switch tracks (which would otherwise force a
// re-fetch). UDS's setOption('track', en) then no-ops (player thinks en is loaded), so the
// box stays empty until a manual CC off→on triggers a fresh, valid fetch.
import { chromium } from '@playwright/test'
import path from 'node:path'
import { createHash } from 'node:crypto'

const DIST = path.resolve('dist')
const ID = 'aircAruvnKk'
const VIDEO = `https://www.youtube.com/watch?v=${ID}&cc_load_policy=1&cc_lang_pref=en`
// realistic captions: many short cues (so the render cursor always has an active one)
const json3 = (v, lang) => JSON.stringify({ events: Array.from({ length: 300 }, (_, i) => ({ tStartMs: i * 2000, dDurationMs: 2000, segs: [{ utf8: `CUE[v=${v} ${lang}]` }] })) })
const STYLE = { fontSizePx: 24, color: '#ffffff', bgColor: '#000000', bgOpacity: 0.55, fontFamily: 'system-ui', outline: true }
const MODES = ['default', 'theater', 'fullscreen', 'miniplayer']
const posByMode = Object.fromEntries(MODES.map((m) => [m, { anchor: 'video', vEdge: 'bottom', fx: 0.5, fy: 0.9 }]))
const SETTINGS = { enabled: true, nativeSubtitles: false, boxes: [{ id: 'sub1', lang: 'en', style: STYLE, posByMode }, { id: 'sub2', lang: '', style: STYLE, posByMode }] }
const extId = (p) => { const h = createHash('sha256').update(p).digest('hex'); let id = ''; for (let i = 0; i < 32; i++) id += String.fromCharCode(97 + parseInt(h[i], 16)); return id }
const log = (...a) => console.log(...a)

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.addInitScript(() => { try { localStorage.setItem('dualSubsDebug', '1') } catch {} })
const uds = []
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[uds.')) uds.push(t) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

const box0 = () => page.evaluate(() => document.querySelector('.dual-subs-box')?.textContent ?? '')
const ccPressed = () => page.evaluate(() => document.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') ?? '?')
const skipAds = () => page.evaluate(() => { const b = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern'); if (b) { b.click(); return 1 } const v = document.querySelector('.ad-showing video'); if (v && isFinite(v.duration)) v.currentTime = v.duration; return 0 }).catch(() => 0)
const nudgePlay = () => page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; if (v.paused) v.play().catch(() => {}); if (v.currentTime < 2) v.currentTime = 5 } }).catch(() => {})
async function box0Fills(ms) { const s = Date.now(); while (Date.now() - s < ms) { await skipAds(); await nudgePlay(); if ((await box0()).includes(`v=${ID}`)) return true; await page.waitForTimeout(500) } return false }

const emptied = new Set()
try {
  // Pre-set settings: box0 en, box1 OFF.
  const id = extId(DIST)
  const pop = await ctx.newPage()
  await pop.goto(`chrome-extension://${id}/popup/popup.html`)
  await pop.evaluate((s) => chrome.storage.sync.set({ dualSubsSettings: s }), SETTINGS)
  await pop.close()

  await ctx.route('**/api/timedtext**', (r) => {
    const u = new URL(r.request().url())
    const lang = u.searchParams.get('lang') || u.searchParams.get('tlang')
    if (lang === 'en' && !emptied.has('en')) { emptied.add('en'); r.fulfill({ status: 200, contentType: 'application/json', body: '' }); return }
    r.fulfill({ status: 200, contentType: 'application/json', body: json3(u.searchParams.get('v'), lang) })
  })
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded', timeout: 45000 })
  try { const r = page.getByRole('button', { name: /reject all|accept all/i }).first(); if (await r.isVisible({ timeout: 3000 })) await r.click() } catch {}
  await page.waitForTimeout(1500); await skipAds()
  log('early cc:', await ccPressed())

  const filled = await box0Fills(18000)
  log('box0 after load: filled=', filled, JSON.stringify(await box0()))
  let afterToggle = null
  if (!filled) {
    log('--- manual CC off→on ---')
    await page.evaluate(() => document.querySelector('.ytp-subtitles-button')?.click())
    await page.waitForTimeout(900)
    await page.evaluate(() => document.querySelector('.ytp-subtitles-button')?.click())
    afterToggle = await box0Fills(10000)
    log('box0 after manual toggle: filled=', afterToggle, JSON.stringify(await box0()))
  }
  const diag = await page.evaluate(() => ({
    t: document.querySelector('video')?.currentTime, paused: document.querySelector('video')?.paused,
    ad: !!document.querySelector('.ad-showing, .ytp-ad-player-overlay'),
    layer: !!document.querySelector('#dual-subs-layer'),
    boxes: [...document.querySelectorAll('.dual-subs-box')].map((b) => ({ text: b.textContent, html: b.innerHTML.slice(0, 120), display: getComputedStyle(b).display })),
  }))
  log('diag:', JSON.stringify(diag, null, 2))
  log('\n=== [uds.*] ===')
  for (const l of uds) log(l)
  log('\n' + (filled ? '✅ box0 fills despite empty first fetch'
    : afterToggle ? '❌ REPRODUCED: empty at load, only fills after manual toggle'
    : '⚠️ empty even after toggle'))
  process.exitCode = filled ? 0 : 1
} catch (e) { log('ERROR', e.message); process.exitCode = 1 } finally { await ctx.close() }

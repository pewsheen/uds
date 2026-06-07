// Capture the anchor glow mid-drag (it shows on pointermove, hides on pointerup) and
// verify it renders for a PAGE-anchor target (whole viewport) — the inner-glow case.
import { chromium } from '@playwright/test'
import path from 'node:path'

const DIST = path.resolve('dist')
const JSON3 = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 600000, segs: [{ utf8: 'glow test cue' }] }] })

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: false, viewport: null,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--start-maximized', '--autoplay-policy=no-user-gesture-required'],
})
try {
  await ctx.route('**/api/timedtext**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON3 }))
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto('https://www.youtube.com/watch?v=aircAruvnKk', { waitUntil: 'domcontentloaded' })
  try {
    const rej = page.getByRole('button', { name: /reject all|accept all|拒絕|接受|同意/i }).first()
    if (await rej.isVisible({ timeout: 2500 })) { await rej.click(); await page.waitForTimeout(800) }
  } catch {}

  const box = page.locator('.dual-subs-box').first()
  await box.waitFor({ state: 'visible', timeout: 25000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.dual-subs-box')].some((b) => b.textContent), null, { timeout: 25000 })
  const bb = await box.boundingBox()
  const vp = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))

  // Drag the box toward the page margin (outside the player) → page anchor → glow = viewport.
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.mouse.move(120, vp.height - 80, { steps: 8 })
  await page.waitForTimeout(300)
  const glow = await page.evaluate(() => {
    const g = document.getElementById('dual-subs-glow')
    if (!g) return null
    const r = g.getBoundingClientRect()
    return { display: g.style.display, w: Math.round(r.width), h: Math.round(r.height), anchor: document.querySelector('.dual-subs-box')?.dataset.anchor }
  })
  console.log('glow during drag:', JSON.stringify(glow))
  await page.screenshot({ path: path.resolve('scripts/glow.png') })
  await page.mouse.up()

  const ok = glow && glow.display === 'block' && glow.w > vp.width * 0.8
  console.log(ok ? '✅ PASS — glow visible and sized to the viewport (page anchor)' : '⚠️ check glow.png + state above')
} finally {
  try { await ctx.close() } catch {}
}

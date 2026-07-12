// Verify the ASR assumptions on the real player: (1) the player exposes kind:'asr'
// tracks via getOption tracklist, and (2) loading the asr track produces a timedtext
// request carrying kind=asr (which content.ts matches on). Uses aircAruvnKk (has en + en/asr).
import { chromium } from "@playwright/test";
import path from "node:path";

const DIST = path.resolve("dist");
const JSON3 = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 600000, segs: [{ utf8: "asr probe" }] }],
});

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    "--start-maximized",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
try {
  await ctx.route("**/api/timedtext**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON3 }),
  );
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(() => {
    window.__tt = [];
    const rec = (u) => {
      if (String(u).includes("/api/timedtext")) window.__tt.push(String(u));
    };
    const of = window.fetch;
    window.fetch = function (...a) {
      rec(a[0]?.url ?? a[0]);
      return of.apply(this, a);
    };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
      rec(u);
      return oo.call(this, m, u, ...r);
    };
  });
  await page.goto("https://www.youtube.com/watch?v=aircAruvnKk", {
    waitUntil: "domcontentloaded",
  });
  try {
    const rej = page
      .getByRole("button", { name: /reject all|accept all|拒絕|接受|同意/i })
      .first();
    if (await rej.isVisible({ timeout: 2500 })) {
      await rej.click();
      await page.waitForTimeout(800);
    }
  } catch {}
  await page.waitForSelector("#movie_player", { timeout: 20000 });
  await page.waitForTimeout(1500);

  // (1) tracklist kinds
  const tracklist = await page.evaluate(() => {
    const p = document.getElementById("movie_player");
    try {
      p?.loadModule?.("captions");
    } catch {}
    const list =
      p?.getOption?.("captions", "tracklist", { includeAsr: true }) || [];
    return list.map((t) => ({
      lang: t.languageCode,
      kind: t.kind || "",
      name: t.name?.simpleText,
    }));
  });
  console.log("tracklist:", JSON.stringify(tracklist, null, 2));

  // (2) load the asr en track specifically, then see its request URL
  await page.evaluate(() => {
    const p = document.getElementById("movie_player");
    const list =
      p.getOption("captions", "tracklist", { includeAsr: true }) || [];
    const asr = list.find((t) => t.languageCode === "en" && t.kind === "asr");
    if (asr) p.setOption("captions", "track", asr);
    return !!asr;
  });
  await page.waitForTimeout(3000);
  const urls = await page.evaluate(() => window.__tt || []);
  const asrReq = urls.find((u) => /[?&]kind=asr(&|$)/.test(u));
  const parse = (u) => {
    const q = new URL(u).searchParams;
    return { lang: q.get("lang"), kind: q.get("kind") };
  };
  console.log("timedtext requests seen:");
  urls.forEach((u) => console.log("  ", JSON.stringify(parse(u))));
  console.log("\nhas kind=asr request?", !!asrReq);
  console.log(
    tracklist.some((t) => t.kind === "asr") && !!asrReq
      ? "✅ PASS — player exposes asr tracks AND the asr request carries kind=asr"
      : "⚠️ assumption not confirmed — see above",
  );
} finally {
  try {
    await ctx.close();
  } catch {}
}

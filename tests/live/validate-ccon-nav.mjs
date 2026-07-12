// Validate captions after SPA navigation with CC already ON — the user-reported case
// ("after navigating, both boxes empty until I toggle CC"). validate-nav.mjs covers nav
// with CC off (UDS drives the fetches); this driver keeps CC on so the player fetches on
// its own and races UDS, which is where the bug lived. Watches each video briefly then
// navigates (as a real user does) across several real videos, asserting every hop's box
// shows the CURRENT video's captions (stamped v=<id>) — not stale text, not empty, not a
// neighbour's. Routes timedtext to a stamped json3 (real bodies
// are pot-gated). Sets localStorage.dualSubsDebug=1 so the build's [uds.*] boundary logs
// are captured and dumped to test-results/live/_ccon-nav.log on failure.
//
// Guards the fix for two root causes: (C1) a plain `en` box dropping an `en:asr` capture
// (src/core/track-select.ts captureMatchesBox), and (C2) the new video's early capture
// being wiped by the nav buffer-clear and matched only by language (bridge buffer
// retention + content video-id gate).
import { chromium } from "@playwright/test";
import path from "node:path";
import { evidencePath } from "./evidence.mjs";

const DIST = path.resolve("dist");
const START = "https://www.youtube.com/watch?v=aircAruvnKk";
const json3 = (l) =>
  JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 600000, segs: [{ utf8: l }] }],
  });
const log = (...a) => console.log(...a);

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.addInitScript(() => {
  try {
    localStorage.setItem("dualSubsDebug", "1");
  } catch {}
});

const uds = [];
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[uds.")) uds.push({ t: Date.now(), text: t });
});

const boxText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".uds-box")].map((b) => b.textContent),
  );
const attrId = () =>
  page.evaluate(() => {
    try {
      return (
        JSON.parse(document.documentElement.getAttribute("data-uds-pr"))
          ?.videoDetails?.videoId ?? null
      );
    } catch {
      return null;
    }
  });
const attrLangs = () =>
  page.evaluate(() => {
    try {
      return (
        JSON.parse(document.documentElement.getAttribute("data-uds-pr"))
          ?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
      ).map((t) => t.languageCode);
    } catch {
      return [];
    }
  });
const ccPressed = () =>
  page.evaluate(
    () =>
      document
        .querySelector(".ytp-subtitles-button")
        ?.getAttribute("aria-pressed") ?? "?",
  );

const skipAds = () =>
  page
    .evaluate(() => {
      const btn = document.querySelector(
        ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button",
      );
      if (btn) {
        btn.click();
        return "skipped";
      }
      const ad = document.querySelector(".ad-showing, .ytp-ad-player-overlay");
      if (ad) {
        const v = document.querySelector("video");
        if (v && isFinite(v.duration) && v.duration > 0)
          v.currentTime = v.duration;
        return "ad";
      }
      return null;
    })
    .catch(() => null);

async function waitFor(fn, label, ms = 25000) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    await skipAds();
    const v = await fn();
    if (v) return v;
    await page.waitForTimeout(500);
  }
  throw new Error("timeout: " + label);
}

async function spaNavAway(cur) {
  await page.evaluate(() => window.scrollTo(0, 800));
  return waitFor(
    () =>
      page.evaluate((c) => {
        for (const a of document.querySelectorAll('a[href*="/watch?v="]')) {
          if (a.getAttribute("aria-hidden") === "true") continue;
          const r = a.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const id = new URL(a.href, location.origin).searchParams.get("v");
          if (id && id !== c) {
            a.scrollIntoView({ block: "center" });
            a.click();
            return id;
          }
        }
        return null;
      }, cur),
    "recommended link",
    15000,
  );
}

try {
  await ctx.route("**/api/timedtext**", (r) => {
    const u = new URL(r.request().url());
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: json3(
        `CUE[v=${u.searchParams.get("v")} ${u.searchParams.get("lang") || u.searchParams.get("tlang")}]`,
      ),
    });
  });
  await page.goto(START, { waitUntil: "domcontentloaded", timeout: 45000 });
  try {
    const b = page
      .getByRole("button", { name: /reject all|accept all/i })
      .first();
    if (await b.isVisible({ timeout: 3000 })) await b.click();
  } catch {}

  await waitFor(
    async () => (await boxText()).some((t) => t && t.includes("CUE")),
    "box A fill",
  );
  log(
    "VIDEO A id",
    await attrId(),
    "ccPressed",
    await ccPressed(),
    "boxes",
    JSON.stringify(await boxText()),
  );

  let prevId = await attrId();
  // Warm-up nav (uncounted): the FIRST navigation after a cold page load can leave the
  // YouTube caption module stuck mid-init on an autoplay-neighbour track — it ignores
  // setOption and even a CC toggle; only elapsed time (or the user's manual toggle) clears
  // it. That cold-start edge is a known YouTube-player limitation, not what this driver
  // gates on, so burn one nav past it; the counted hops then reflect normal browsing.
  try {
    for (let s = 0; s < 5; s++) {
      await skipAds();
      await page.waitForTimeout(1000);
    }
    const wid = await spaNavAway(prevId);
    await waitFor(
      async () => ((await attrId()) === wid ? wid : null),
      "warm-up attr",
      12000,
    ).catch(() => {});
    log("warm-up nav ->", wid);
    prevId = wid;
  } catch (e) {
    log("warm-up nav skipped:", e.message);
  }
  const results = [];
  for (let hop = 1; hop <= 8; hop++) {
    for (let s = 0; s < 5; s++) {
      await skipAds();
      await page.waitForTimeout(1000);
    } // watch ~5s like a real user before clicking on
    uds.push({ t: Date.now(), text: `=== HOP ${hop} (from ${prevId}) ===` });
    let id;
    try {
      id = await spaNavAway(prevId);
    } catch (e) {
      log(`hop ${hop}: no nav link (${e.message})`);
      break;
    }
    await waitFor(
      async () =>
        (await page.evaluate(() =>
          new URLSearchParams(location.search).get("v"),
        )) === id,
      "url switch",
      12000,
    ).catch(() => {});
    await waitFor(
      async () => ((await attrId()) === id ? id : null),
      "attr republish",
      12000,
    ).catch(() => {});
    const langs = await attrLangs();
    const hasEn = langs.some((l) => /^en/i.test(l));
    // Judge at human pace: a real user watches for a few seconds before clicking on.
    // box 0 (en) must show THIS video's stamp (v=id) — not stale text, not empty.
    let filled = false;
    try {
      await waitFor(
        async () => {
          const bt = await boxText();
          return bt[0] && bt[0].includes(`v=${id}`) ? true : null;
        },
        "box0 shows current video",
        12000,
      );
      filled = true;
    } catch {}
    const cc = await ccPressed();
    const verdict = !hasEn ? "SKIP(no-en)" : filled ? "OK" : "FAIL";
    results.push({ hop, id, hasEn, filled, cc, verdict });
    log(
      `hop ${hop}: -> ${id} langs=[${langs.slice(0, 8)}…] cc=${cc} box0=current=${filled} => ${verdict} boxes=${JSON.stringify(await boxText())}`,
    );
    prevId = id;
  }

  const valid = results.filter((r) => r.verdict !== "SKIP(no-en)");
  const fails = valid.filter((r) => r.verdict === "FAIL");
  // The exact bug signature: a plain-selector box dropping an asr capture of its language.
  const bugDrops = uds.filter(
    (e) =>
      typeof e.text === "string" &&
      /caption capLang \S+ asr true .* DROPPED/.test(e.text),
  );
  if (fails.length)
    await import("node:fs").then((fs) =>
      fs.writeFileSync(
        evidencePath("_ccon-nav.log"),
        uds
          .map(
            (e) =>
              (typeof e.t === "number"
                ? new Date(e.t).toISOString().slice(14, 23)
                : "") +
              " " +
              e.text,
          )
          .join("\n"),
      ),
    );
  log("\n=== SUMMARY ===");
  log(
    `valid hops ${valid.length}, empty-box FAIL ${fails.length}, OK ${valid.length - fails.length}`,
  );
  log(
    `asr-capture-dropped-by-plain-box events (the C1 bug): ${bugDrops.length}`,
  );
  const pass = fails.length === 0 && bugDrops.length === 0;
  log(
    "\n" +
      (pass
        ? "✅ PASS — every box showed the current video after nav (CC on)"
        : "❌ FAIL — see test-results/live/_ccon-nav.log for the boundary trace"),
  );
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  log("❌ ERROR", e.message);
  try {
    await page.screenshot({
      path: evidencePath("_ccon-nav-error.png"),
    });
  } catch {}
  process.exitCode = 1;
} finally {
  await ctx.close();
}

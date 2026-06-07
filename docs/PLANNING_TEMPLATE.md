# Planning Template (Risk-First)

A fill-in template for planning a new project or feature. The methodology is captured
as the reusable **`risk-first-planning`** skill (`~/.claude/skills/risk-first-planning/`);
this file is the project's copy plus a worked example of what happens when you skip it.

> **One-liner:** Verify the riskiest assumptions in the **real environment first**, before
> designing around them. Test coverage tends to be inversely correlated with risk — pure
> logic gets exhaustive tests, scary integration gets mocked away — which produces false
> confidence. A bug lives at exactly the boundary you decided to mock.

---

## Template — copy this into each plan

### 0. Riskiest assumptions (spike FIRST)
List every assumption where "if this is wrong, the design changes." For each: how it's
**verified** (a cheap real-environment test) or mark **UNVERIFIED**. Do not write the
detailed spec until the load-bearing ones are real-tested.

| Assumption | Load-bearing? | Verified how? | Status |
|---|---|---|---|
| Can we load/deploy the artifact in the target runtime? | | | |
| Can we get the data (auth / token / rate-limit / gate)? | | | |
| Are the real selectors / APIs as assumed? | | | |

### 1. Walking skeleton
The thinnest end-to-end slice through **all** layers in the **real** environment, before
any deep per-module work. What is the one-line "it actually does the thing" proof?

### 2. Risk map vs coverage map
Where is the risk highest? Where are the tests? If they don't overlap → false confidence.
Add at least one real-environment check at each high-risk seam.

### 3. Environment & integration
Target runtime + versions · how the artifact is loaded/deployed · external API auth /
tokens / rate-limits / anti-bot gates · real DOM selectors / API shapes.

### 4. Pure-logic design & test strategy
The easy, safe part. Pure functions + property/golden/mutation tests. (Necessary, not
sufficient.)

### 5. Error & edge paths
Partial-failure isolation, retries/backoff, rate limits, missing/invalid data.

### 6. UX / interaction acceptance (interactive products)
Event handling & propagation, input feel, visual feedback. The interaction IS the product.

### 7. Definition of Done
At least one **real-environment, user-observable** check — not just "tests pass."

### 8. Reusable real-env driver scripts
Kept in the repo as first-class artifacts (in this project: `scripts/validate-*.mjs`,
`npm run test:live`).

---

## Test & tool ladder (what to include + the minimum bar)

Cheap/narrow → expensive/real. Each rung catches what the rung below can't. **Pick the
rungs your project's risk demands — and don't stop at the cheap ones just because they're easy.**

| Rung | Catches | Example tools |
|---|---|---|
| **Static** — typecheck + lint (incl. *architectural* lint, e.g. "core stays pure") | type errors, layering violations | `tsc`, ESLint `no-restricted-globals` |
| **Unit** — pure logic | logic bugs | Vitest / Jest |
| **Property** — invariants, "never throws", output ordering | edge cases you didn't enumerate | fast-check |
| **Golden / snapshot** — parsers vs **recorded real** samples | format drift | snapshot + a manual `record` script |
| **Mutation** — proves the tests actually catch bugs | weak/fake tests | Stryker (gate the high-value core) |
| **Contract** — adapter boundaries (request/response shape, retry) | wrong assumptions about a dependency | small adapter tests |
| **Smoke / integration** — does it wire up & load (deterministic, fixtures) | "nothing renders / won't load" | Playwright |
| **Real-environment driver** — works against the **actual** external system; kept in repo | the bugs mocks hide (auth, tokens, gates, real DOM) | scripted real run (`scripts/validate-*.mjs`) |
| **Manual UX pass** — feel, event propagation, visual | interaction bugs | a human + screenshots |
| **Evidence** — attach to every "it works" claim | false success claims | screenshots, DOM/state dumps, console/network/CDP |

### Minimum bar by project type (must-include)

- **Pure library:** Static + Unit (+ Property where invariants exist).
- **Parser / serializer:** + Golden against **recorded real** samples.
- **App / extension / anything that loads or deploys:** + Smoke (deterministic)
  **+ at least one real-environment driver, from day one.**
- **Interactive UI (drag, input, real-time):** + a **manual UX pass** + screenshot evidence.
- **Touches external API / auth / token / anti-bot / third-party site:** a **real-env spike
  in §0 on day one**; never rely on mocks alone to call it done.

> Rule of thumb: **if the artifact loads/deploys or talks to something external, "done"
> requires at least one green real-environment run — a passing smoke-with-fixtures is not enough.**

---

## Worked example — the uds (YouTube dual subs) case study

**What looked great:** ports-and-adapters architecture, a pure `src/core/**` with
property + golden + **mutation (≥85%)** tests, plus a Playwright smoke test. `verify:full`
exited 0. By the original Definition of Done, it was "done."

**What broke on first real use — every failure sat on a mocked boundary:**

| Seam | Plan's handling | Reality |
|---|---|---|
| Extension load | assumed `--load-extension` works | Chrome **Stable 148 ignores it**; only Playwright's bundled Chromium honors it |
| Caption fetch (network) | fixture replay; core = "fetch baseUrl + parse" | YouTube gates timedtext with a **`pot` token**; a plain fetch returns an empty 200 → the whole fetch/parse data source was wrong and had to be replaced with "capture the player's own response via the MAIN-world bridge" |
| Real DOM / player | fake fixture page | real player is an SPA with BotGuard; loads one caption track at a time |
| Human input (drag) | not in the plan at all | 7 separate UX bugs (bounce, trapped-in-player, selects text, grabs the video, …) |

**The most painful part:** the spec *did* note "YouTube may need a pot token," but filed it
as an "adapter detail, out of scope" and the tests mocked it to always succeed. **That one
deferred line was the thing that later forced a full re-architecture.**

**Root cause:** rigor was concentrated on the lowest-risk part (pure logic) and the
highest-risk parts (load, fetch, real DOM, interaction) were mocked away or deferred —
*because* they're hard to test. Risk and coverage were inverted.

**What would have caught it:** one cheap day-one spike — "in a really-loaded extension, can
we get captions from a real YouTube video and show one line?" — surfaces the pot gate and
the `--load-extension` problem before the architecture is built.

**Note on real-env testing limits:** automated browsers (Playwright/CDP) trip BotGuard, so
the player's own `pot` request returns empty there too — you can validate the *plumbing*
with a substituted body, but final caption verification needs a real, non-automated browser.
That's itself an environment assumption worth writing down (template §3).

# Definition of Done

Machine-checkable:
- [ ] `npm run verify:full` exits 0 (typecheck, lint incl. no-DOM-in-core, unit+property+contract, golden, mutation >= 85%, build, smoke)
- [ ] Mutation score for `src/core` >= 85% (enforced by stryker `break`)

Requirement -> test traceability (item E):
| Requirement | Test |
|---|---|
| Dual subtitles render | smoke: "renders both boxes" + tick tests |
| Per-language selection | storage contract (langs) + buildTimedTextUrl property |
| Source via timedtext+tlang | buildTimedTextUrl tests |
| Parse cues | parse example + property + golden |
| Time sync / no needless redraw | tick example + property |
| Drag + dual-mode anchor | anchor tests + smoke drag (data-anchor=page) |
| Grow direction (vEdge) | pickVerticalEdge tests + geometry computeBoxRect |
| Anti-lost clamp | geometry within-viewport + idempotent properties |
| Overlap avoidance | overlap properties |
| Style | styleToCss tests |
| Always-on-top / fullscreen mount | decideMountTarget tests + smoke layer attached |
| Toggle | storage (enabled) + content guard |
| Error paths | error-paths tests + lifecycle |

Visual (human-approved once):
- [ ] Playwright screenshot baselines for: docked default, floating, dragging glow (added later via `toHaveScreenshot`).

import { expect, test } from "vitest";
import { avoidOverlap, rectsOverlap } from "../../src/core/overlap";

test("pushes the moved rect clear of the other with a gap", () => {
  const a = { x: 0, y: 100, width: 100, height: 40 };
  const other = { x: 20, y: 110, width: 100, height: 40 };
  const out = avoidOverlap(a, [other], 8);
  expect(rectsOverlap(out, other, 8)).toBe(false);
});

test("no-op when already clear", () => {
  const a = { x: 0, y: 0, width: 50, height: 20 };
  const other = { x: 0, y: 200, width: 50, height: 20 };
  expect(avoidOverlap(a, [other], 8)).toEqual(a);
});

test("exactly gap apart does NOT overlap; one pixel closer does", () => {
  const a = { x: 0, y: 0, width: 100, height: 40 };
  const b = { x: 108, y: 0, width: 100, height: 40 }; // 100 + gap 8 = 108: touching at gap
  expect(rectsOverlap(a, b, 8)).toBe(false);
  expect(rectsOverlap(a, { ...b, x: 107 }, 8)).toBe(true);
  // same check on Y axis
  const c = { x: 0, y: 48, width: 100, height: 40 }; // 0+40+gap8 = 48
  expect(rectsOverlap(a, c, 8)).toBe(false);
  expect(rectsOverlap(a, { ...c, y: 47 }, 8)).toBe(true);
});

test("prefers moving up when up/down distances are equal", () => {
  const a = { x: 0, y: 100, width: 100, height: 40 };
  const o = { x: 0, y: 100, width: 100, height: 40 }; // identical => |moveUp| === |moveDown|
  const out = avoidOverlap(a, [o], 0);
  expect(out.y).toBeLessThan(100); // <= picks up (60); mutant < would pick down (140)
  expect(rectsOverlap(out, o, 0)).toBe(false);
});

test("moves DOWN when down is strictly closer", () => {
  // moved rect sits mostly below the other so |moveDown| < |moveUp|.
  const r = { x: 0, y: 90, width: 100, height: 40 }; // bottom at 130
  const o = { x: 0, y: 0, width: 100, height: 100 }; // bottom at 100
  // moveUp   = o.y - gap - (r.y + r.height) = 0 - 0 - 130 = -130
  // moveDown = o.y + o.height + gap - r.y   = 0 + 100 + 0 - 90 = 10
  const out = avoidOverlap(r, [o], 0);
  expect(out.y).toBeCloseTo(100); // r.y(90) + moveDown(10) -> 100 (kills `true ? moveUp` and the `+ r.y` arithmetic mutant)
  expect(out.y).toBeGreaterThan(r.y); // genuinely moved down, not up
  expect(rectsOverlap(out, o, 0)).toBe(false);
});

test("rectsOverlap: boundary on the LEFT/top-of side (symmetric disjuncts)", () => {
  const a = { x: 200, y: 200, width: 100, height: 40 };
  // b is to the LEFT of a, exactly gap apart: b.x + b.width + gap === a.x
  const bLeft = { x: 0, y: 200, width: 192, height: 40 }; // 0+192+8 = 200
  expect(rectsOverlap(a, bLeft, 8)).toBe(false);
  expect(rectsOverlap(a, { ...bLeft, x: 1 }, 8)).toBe(true); // 1px closer -> overlap
  // b is ABOVE a, exactly gap apart: b.y + b.height + gap === a.y
  const bAbove = { x: 200, y: 0, width: 100, height: 192 }; // 0+192+8 = 200
  expect(rectsOverlap(a, bAbove, 8)).toBe(false);
  expect(rectsOverlap(a, { ...bAbove, y: 1 }, 8)).toBe(true);
});

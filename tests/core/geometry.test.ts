import { expect, test } from "vitest";
import {
  toFraction,
  fromFraction,
  computeBoxRect,
  clampFraction,
} from "../../src/core/geometry";

const box = { x: 100, y: 50, width: 800, height: 400 };

test("toFraction / fromFraction round-trip", () => {
  const p = { x: 500, y: 250 };
  const f = toFraction(p, box);
  const back = fromFraction(f, box);
  expect(back.x).toBeCloseTo(p.x);
  expect(back.y).toBeCloseTo(p.y);
});

test("computeBoxRect: bottom edge pins to fy and grows up", () => {
  const r = computeBoxRect(
    { fx: 0.5, fy: 1 },
    box,
    { width: 200, height: 60 },
    "bottom",
  );
  expect(r.x).toBeCloseTo(100 + 0.5 * 800 - 100); // cx=500, left=400
  expect(r.y).toBeCloseTo(50 + 400 - 60); // bottom at 450 -> top=390
});

test("clampFraction keeps the rendered box inside the viewport", () => {
  const vp = { width: 1000, height: 500 };
  const f = clampFraction(
    { fx: 5, fy: 5 },
    box,
    { width: 200, height: 60 },
    "top",
    vp,
    8,
  );
  const r = computeBoxRect(f, box, { width: 200, height: 60 }, "top");
  expect(r.x).toBeGreaterThanOrEqual(8 - 0.001);
  expect(r.x + r.width).toBeLessThanOrEqual(1000 - 8 + 0.001);
  expect(r.y + r.height).toBeLessThanOrEqual(500 - 8 + 0.001);
});

test("computeBoxRect: top edge pins to fy and grows down", () => {
  const r = computeBoxRect(
    { fx: 0.5, fy: 0 },
    box,
    { width: 200, height: 60 },
    "top",
  );
  expect(r.y).toBeCloseTo(50); // anchorY = 50, top edge at anchorY
  expect(r.y + r.height).toBeCloseTo(110);
});

test("box larger than the viewport pins to the margin (Math.max floor)", () => {
  // viewport smaller than size+2*margin: viewport.w - size.w - margin < margin,
  // so maxX/maxY must fall back to `margin` (kills Math.max -> Math.min on lines 27/28).
  const vp = { width: 150, height: 100 };
  const size = { width: 200, height: 120 }; // wider & taller than viewport
  const f = clampFraction({ fx: 5, fy: 5 }, box, size, "top", vp, 8);
  const r = computeBoxRect(f, box, size, "top");
  expect(r.x).toBeCloseTo(8); // pinned to margin, not a negative min()
  expect(r.y).toBeCloseTo(8);
});

test("clampFraction with bottom vEdge keeps an out-of-range box in viewport", () => {
  const vp = { width: 1000, height: 500 };
  const f = clampFraction(
    { fx: -2, fy: 2 },
    box,
    { width: 200, height: 60 },
    "bottom",
    vp,
    8,
  );
  const r = computeBoxRect(f, box, { width: 200, height: 60 }, "bottom");
  expect(r.x).toBeGreaterThanOrEqual(8 - 1e-6);
  expect(r.y).toBeGreaterThanOrEqual(8 - 1e-6);
  expect(r.x + r.width).toBeLessThanOrEqual(1000 - 8 + 1e-6);
  expect(r.y + r.height).toBeLessThanOrEqual(500 - 8 + 1e-6);
});

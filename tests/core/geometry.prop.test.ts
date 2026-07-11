import { test } from "vitest";
import fc from "fast-check";
import { computeBoxRect, clampFraction } from "../../src/core/geometry";
import type { VEdge } from "../../src/core/types";

const box = { x: 100, y: 50, width: 800, height: 400 };
const vp = { width: 1200, height: 700 };
const sizeArb = fc.record({
  width: fc.integer({ min: 10, max: 600 }),
  height: fc.integer({ min: 10, max: 300 }),
});
const fArb = fc.record({
  fx: fc.double({ min: -3, max: 3, noNaN: true }),
  fy: fc.double({ min: -3, max: 3, noNaN: true }),
});
const edgeArb: fc.Arbitrary<VEdge> = fc.constantFrom("top", "bottom");

test("clamped box is always within the viewport (margin 8)", () => {
  fc.assert(
    fc.property(fArb, sizeArb, edgeArb, (f, size, edge) => {
      const c = clampFraction(f, box, size, edge, vp, 8);
      const r = computeBoxRect(c, box, size, edge);
      return (
        r.x >= 8 - 1e-6 &&
        r.y >= 8 - 1e-6 &&
        r.x + r.width <= vp.width - 8 + 1e-6 &&
        r.y + r.height <= vp.height - 8 + 1e-6
      );
    }),
  );
});

test("clampFraction is idempotent", () => {
  fc.assert(
    fc.property(fArb, sizeArb, edgeArb, (f, size, edge) => {
      const once = clampFraction(f, box, size, edge, vp, 8);
      const twice = clampFraction(once, box, size, edge, vp, 8);
      return (
        Math.abs(once.fx - twice.fx) < 1e-9 &&
        Math.abs(once.fy - twice.fy) < 1e-9
      );
    }),
  );
});

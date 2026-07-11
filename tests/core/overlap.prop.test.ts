import { test } from "vitest";
import fc from "fast-check";
import { avoidOverlap, rectsOverlap } from "../../src/core/overlap";

const rectArb = fc.record({
  x: fc.integer({ min: 0, max: 500 }),
  y: fc.integer({ min: 0, max: 500 }),
  width: fc.integer({ min: 10, max: 200 }),
  height: fc.integer({ min: 10, max: 80 }),
});

test("output never overlaps the single other (gap 8)", () => {
  fc.assert(
    fc.property(rectArb, rectArb, (a, other) => {
      const out = avoidOverlap(a, [other], 8);
      return !rectsOverlap(out, other, 8);
    }),
  );
});

test("idempotent", () => {
  fc.assert(
    fc.property(rectArb, rectArb, (a, other) => {
      const once = avoidOverlap(a, [other], 8);
      const twice = avoidOverlap(once, [other], 8);
      return JSON.stringify(once) === JSON.stringify(twice);
    }),
  );
});

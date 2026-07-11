import { test } from "vitest";
import fc from "fast-check";
import { pickVerticalEdge } from "../../src/core/anchor";

test("pickVerticalEdge partitions at 0.5", () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (fy) => {
      return pickVerticalEdge(fy) === (fy < 0.5 ? "top" : "bottom");
    }),
  );
});

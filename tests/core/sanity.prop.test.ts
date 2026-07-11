import { test } from "vitest";
import fc from "fast-check";
import { double } from "../../src/core/sanity";

test("double is always even-ish: double(n) === n + n", () => {
  fc.assert(fc.property(fc.integer(), (n) => double(n) === n + n));
});

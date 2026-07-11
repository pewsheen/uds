import { test } from "vitest";
import fc from "fast-check";
import { decodeEntities } from "../../src/core/entities";

test("never throws on arbitrary input", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      decodeEntities(s);
      return true;
    }),
  );
});

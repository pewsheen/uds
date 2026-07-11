import { test } from "vitest";
import fc from "fast-check";
import { initLifecycle, lifecycle } from "../../src/core/lifecycle";
import type { LifecycleEvent } from "../../src/core/types";

const eventArb: fc.Arbitrary<LifecycleEvent> = fc.oneof(
  fc.constant({ type: "enable" } as const),
  fc.constant({ type: "tracksLoaded" } as const),
  fc.constant({ type: "retry" } as const),
  fc.constant({ type: "disable" } as const),
  fc.string().map((m) => ({ type: "failed", message: m }) as const),
);
const VALID = new Set(["idle", "loadingTracks", "active", "error"]);

test("any event sequence yields a valid state", () => {
  fc.assert(
    fc.property(fc.array(eventArb), (events) => {
      let s = initLifecycle();
      for (const e of events) s = lifecycle(s, e);
      return VALID.has(s.kind);
    }),
  );
});

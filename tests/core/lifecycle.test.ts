import { expect, test } from "vitest";
import { initLifecycle, lifecycle } from "../../src/core/lifecycle";

test("happy path and error->retry", () => {
  let s = initLifecycle();
  s = lifecycle(s, { type: "enable" });
  expect(s.kind).toBe("loadingTracks");
  s = lifecycle(s, { type: "tracksLoaded" });
  expect(s.kind).toBe("active");
  s = lifecycle(s, { type: "failed", message: "x" });
  expect(s.kind).toBe("error");
  s = lifecycle(s, { type: "retry" });
  expect(s.kind).toBe("loadingTracks");
  s = lifecycle(s, { type: "disable" });
  expect(s.kind).toBe("idle");
});

test("guards: events are no-ops from the wrong state", () => {
  expect(lifecycle({ kind: "active" }, { type: "enable" }).kind).toBe("active");
  expect(lifecycle({ kind: "idle" }, { type: "tracksLoaded" }).kind).toBe(
    "idle",
  );
  expect(lifecycle({ kind: "active" }, { type: "retry" }).kind).toBe("active");
});

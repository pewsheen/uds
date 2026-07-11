import { expect, test } from "vitest";
import { parseTimedText } from "../../src/core/parse";
import { selectCue } from "../../src/core/cue-select";
import { lifecycle, initLifecycle } from "../../src/core/lifecycle";

test("parse of malformed / empty xml yields [] without throwing", () => {
  expect(parseTimedText("")).toEqual([]);
  expect(parseTimedText("<not-xml")).toEqual([]);
  expect(
    parseTimedText("<transcript><text>missing attrs</text></transcript>"),
  ).toEqual([]);
});

test("selectCue on empty cues is null", () => {
  expect(selectCue([], 5)).toBeNull();
});

test("failed -> error carries message; retry recovers", () => {
  let s = lifecycle(initLifecycle(), { type: "enable" });
  s = lifecycle(s, { type: "failed", message: "network" });
  expect(s).toEqual({ kind: "error", message: "network" });
  expect(lifecycle(s, { type: "retry" }).kind).toBe("loadingTracks");
});

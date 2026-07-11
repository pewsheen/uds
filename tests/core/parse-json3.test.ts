import { expect, test } from "vitest";
import { parseJson3 } from "../../src/core/parse-json3";

test("parses json3 events into monotonic cues with joined segments", () => {
  const json = JSON.stringify({
    events: [
      {
        tStartMs: 0,
        dDurationMs: 3000,
        segs: [{ utf8: "Hello " }, { utf8: "world" }],
      },
      { tStartMs: 3000, dDurationMs: 2500, segs: [{ utf8: "second line" }] },
    ],
  });
  expect(parseJson3(json)).toEqual([
    { start: 0, end: 3, text: "Hello world" },
    { start: 3, end: 5.5, text: "second line" },
  ]);
});

test("skips events with no segments, no timing, or empty text", () => {
  const json = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 2000 }, // no segs (window definition)
      { segs: [{ utf8: "no timing" }] }, // no timing
      { tStartMs: 1000, dDurationMs: 0, segs: [{ utf8: "zero dur" }] }, // dur <= 0
      { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "\n" }] }, // whitespace only
      { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "kept" }] },
    ],
  });
  expect(parseJson3(json)).toEqual([{ start: 4, end: 5, text: "kept" }]);
});

test("never throws on malformed input", () => {
  expect(parseJson3("")).toEqual([]);
  expect(parseJson3("not json")).toEqual([]);
  expect(parseJson3('{"events":null}')).toEqual([]);
  expect(parseJson3("{}")).toEqual([]);
});

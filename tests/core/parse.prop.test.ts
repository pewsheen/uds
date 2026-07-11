import { test } from "vitest";
import fc from "fast-check";
import { parseTimedText } from "../../src/core/parse";

test("never throws on arbitrary input", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      parseTimedText(s);
      return true;
    }),
  );
});

const cueArb = fc.record({
  start: fc.double({ min: 0, max: 10000, noNaN: true }),
  dur: fc.double({ min: 0.01, max: 100, noNaN: true }),
  text: fc.string(),
});

function toXml(cues: { start: number; dur: number; text: string }[]): string {
  const rows = cues
    .map(
      (c) =>
        `<text start="${c.start}" dur="${c.dur}">${c.text.replace(/[&<>]/g, "")}</text>`,
    )
    .join("\n");
  return `<transcript>${rows}</transcript>`;
}

test("cues are monotonic by start and each has start < end", () => {
  fc.assert(
    fc.property(fc.array(cueArb), (cues) => {
      const parsed = parseTimedText(toXml(cues));
      for (let i = 1; i < parsed.length; i++) {
        if (parsed[i]!.start < parsed[i - 1]!.start) return false;
      }
      return parsed.every((c) => c.start < c.end);
    }),
  );
});

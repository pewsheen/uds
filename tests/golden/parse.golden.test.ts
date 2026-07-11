import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parseTimedText } from "../../src/core/parse";

const xml = readFileSync(
  new URL("../../fixtures/timedtext-sample.xml", import.meta.url),
  "utf8",
);

test("parseTimedText output matches approved snapshot", () => {
  expect(parseTimedText(xml)).toMatchSnapshot();
});

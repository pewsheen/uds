import { expect, test } from "vitest";
import { decodeEntities } from "../../src/core/entities";

test("decodes named and numeric entities", () => {
  expect(decodeEntities("a &amp; b")).toBe("a & b");
  expect(decodeEntities("&lt;tag&gt;")).toBe("<tag>");
  expect(decodeEntities("it&#39;s &quot;ok&quot;")).toBe(`it's "ok"`);
  expect(decodeEntities("&#x41;")).toBe("A");
});

test("apos, gt, unknown passthrough, uppercase hex, out-of-range codepoint", () => {
  expect(decodeEntities("&apos;")).toBe("'");
  expect(decodeEntities("a&gt;b")).toBe("a>b");
  expect(decodeEntities("&unknown;")).toBe("&unknown;");
  expect(decodeEntities("&#X41;")).toBe("A"); // uppercase hex
  expect(decodeEntities("&#x110000;")).toBe("&#x110000;"); // out of range -> unchanged, must NOT throw
});

test("codepoint boundaries: exactly 0 and exactly 0x10ffff decode (not passthrough)", () => {
  // code===0 must decode to NUL (kills code>=0 -> code>0, which would passthrough)
  expect(decodeEntities("&#0;")).toBe(String.fromCodePoint(0));
  // code===0x10ffff must decode (kills code<=0x10ffff -> code<0x10ffff)
  expect(decodeEntities("&#x10ffff;")).toBe(String.fromCodePoint(0x10ffff));
  // just over the max stays as-is
  expect(decodeEntities("&#x110001;")).toBe("&#x110001;");
});

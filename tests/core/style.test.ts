import { expect, test } from "vitest";
import { hexToRgb, styleToCss } from "../../src/core/style";

test("maps settings to css declarations", () => {
  const css = styleToCss({
    fontSizePx: 24,
    color: "#fff",
    bgColor: "#000000",
    bgOpacity: 0.6,
    fontFamily: "Arial",
    outline: true,
  });
  expect(css.fontSize).toBe("24px");
  expect(css.color).toBe("#fff");
  expect(css.backgroundColor).toBe("rgba(0,0,0,0.6)");
  expect(css.fontFamily).toBe("Arial");
  expect(css.textShadow).not.toBe("none");
});

test("background color is composed from bgColor + bgOpacity", () => {
  const css = styleToCss({
    fontSizePx: 24,
    color: "#fff",
    bgColor: "#ff8800",
    bgOpacity: 0.5,
    fontFamily: "x",
    outline: false,
  });
  expect(css.backgroundColor).toBe("rgba(255,136,0,0.5)");
});

test("outline:false yields textShadow none", () => {
  expect(
    styleToCss({
      fontSizePx: 20,
      color: "#000",
      bgColor: "#000000",
      bgOpacity: 0.5,
      fontFamily: "x",
      outline: false,
    }).textShadow,
  ).toBe("none");
});

test("outline:true yields the exact shadow string (not empty)", () => {
  expect(
    styleToCss({
      fontSizePx: 20,
      color: "#000",
      bgColor: "#000000",
      bgOpacity: 0.5,
      fontFamily: "x",
      outline: true,
    }).textShadow,
  ).toBe("0 2px 6px rgba(0,0,0,0.85)");
});

test("bgOpacity below 0 and above 1 is clamped into [0,1]", () => {
  expect(
    styleToCss({
      fontSizePx: 20,
      color: "#000",
      bgColor: "#000000",
      bgOpacity: -0.5,
      fontFamily: "x",
      outline: false,
    }).backgroundColor,
  ).toBe("rgba(0,0,0,0)");
  expect(
    styleToCss({
      fontSizePx: 20,
      color: "#000",
      bgColor: "#000000",
      bgOpacity: 2,
      fontFamily: "x",
      outline: false,
    }).backgroundColor,
  ).toBe("rgba(0,0,0,1)");
});

test("hexToRgb parses 6-digit hex", () => {
  expect(hexToRgb("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
});

test("hexToRgb accepts no leading hash and uppercase", () => {
  expect(hexToRgb("FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
});

test("hexToRgb expands 3-digit shorthand", () => {
  expect(hexToRgb("#f08")).toEqual({ r: 255, g: 0, b: 136 });
});

test("hexToRgb falls back to black on malformed input", () => {
  expect(hexToRgb("nope")).toEqual({ r: 0, g: 0, b: 0 });
  expect(hexToRgb("#12")).toEqual({ r: 0, g: 0, b: 0 });
  expect(hexToRgb("")).toEqual({ r: 0, g: 0, b: 0 });
});

test("hexToRgb returns black for non-string input", () => {
  expect(hexToRgb(null)).toEqual({ r: 0, g: 0, b: 0 });
  expect(hexToRgb(undefined)).toEqual({ r: 0, g: 0, b: 0 });
});

test("hexToRgb trims surrounding whitespace", () => {
  // kills the mutant that drops .trim()
  expect(hexToRgb("  ffffff  ")).toEqual({ r: 255, g: 255, b: 255 });
});

test("hexToRgb only strips a leading hash, not one elsewhere", () => {
  // kills the /^#/ -> /#/ mutant: a trailing '#' must not be stripped into a valid 6-hex
  expect(hexToRgb("ffffff#")).toEqual({ r: 0, g: 0, b: 0 });
});

test("hexToRgb rejects strings anchored loosely (extra chars before/after 6 hex)", () => {
  // kills the ^-anchor-removal mutant (leading junk) and the $-anchor-removal mutant (trailing junk)
  expect(hexToRgb("zffffff")).toEqual({ r: 0, g: 0, b: 0 });
  expect(hexToRgb("fffffff")).toEqual({ r: 0, g: 0, b: 0 });
});

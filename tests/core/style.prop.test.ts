import { test } from "vitest";
import fc from "fast-check";
import { styleToCss } from "../../src/core/style";

test("background opacity is always within [0,1] in the output", () => {
  fc.assert(
    fc.property(
      fc.double({ min: -5, max: 5, noNaN: true }),
      fc.integer({ min: 1, max: 200 }),
      (op, size) => {
        const css = styleToCss({
          fontSizePx: size,
          color: "#000",
          bgColor: "#000000",
          bgOpacity: op,
          fontFamily: "x",
          outline: false,
        });
        const m = /rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(css.backgroundColor);
        if (!m) return false;
        const a = parseFloat(m[1]!);
        return a >= 0 && a <= 1 && css.fontSize === `${size}px`;
      },
    ),
  );
});

test("any valid 6-hex bgColor yields rgb channels in 0..255", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0xffffff }), (n) => {
      const hex = "#" + n.toString(16).padStart(6, "0");
      const css = styleToCss({
        fontSizePx: 20,
        color: "#000",
        bgColor: hex,
        bgOpacity: 0.5,
        fontFamily: "x",
        outline: false,
      });
      const m = /rgba\((\d+),(\d+),(\d+),0\.5\)/.exec(css.backgroundColor);
      if (!m) return false;
      return [m[1], m[2], m[3]].every((c) => {
        const v = Number(c);
        return v >= 0 && v <= 255;
      });
    }),
  );
});

import { expect, test } from "vitest";
import { decideSubtitleVisibility } from "../../src/core/subtitle-visibility";

test.each([
  [false, false, false, false, false],
  [false, false, true, false, false],
  [false, true, false, false, false],
  [false, true, true, false, false],
  [true, false, false, false, false],
  [true, false, true, false, true],
  [true, true, false, true, false],
  [true, true, true, true, true],
])(
  "player CC %s, UDS %s, original %s -> UDS %s, original %s",
  (playerCc, udsToggle, originalToggle, uds, original) => {
    expect(
      decideSubtitleVisibility(playerCc, udsToggle, originalToggle),
    ).toEqual({ uds, original });
  },
);

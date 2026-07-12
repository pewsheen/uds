import { describe, expect, it } from "vitest";
import {
  canProxyCaptionRequest,
  matchesKnownCaptionUrl,
} from "../../src/adapters/caption-proxy";

const CAPTION_URL =
  "https://cf-timedtext.aux.pv-cdn.net/subtitle.ttml?token=abc";

describe("caption proxy authorization", () => {
  it("allows exact Prime pages to request the exact HTTPS caption host", () => {
    expect(
      canProxyCaptionRequest(
        "https://www.primevideo.com/detail/title",
        CAPTION_URL,
      ),
    ).toBe(true);
    expect(
      canProxyCaptionRequest(
        "https://fe.primevideo.com/detail/title",
        CAPTION_URL,
      ),
    ).toBe(true);
  });

  it.each([
    "https://www.youtube.com/watch?v=x",
    "https://evilprimevideo.com/detail/title",
    "https://www.primevideo.com.evil.test/detail/title",
    "http://www.primevideo.com/detail/title",
    undefined,
  ])("rejects a non-Prime sender: %s", (senderUrl) => {
    expect(canProxyCaptionRequest(senderUrl, CAPTION_URL)).toBe(false);
  });

  it.each([
    "http://cf-timedtext.aux.pv-cdn.net/subtitle.ttml",
    "https://cf-timedtext.aux.pv-cdn.net.evil.test/subtitle.ttml",
    "https://user:pass@cf-timedtext.aux.pv-cdn.net/subtitle.ttml",
    "https://cf-timedtext.aux.pv-cdn.net:444/subtitle.ttml",
    "not a url",
  ])("rejects a caption URL outside the exact CDN authority: %s", (url) => {
    expect(
      canProxyCaptionRequest("https://www.primevideo.com/detail/title", url),
    ).toBe(false);
  });

  it("only matches a URL already discovered for the current video", () => {
    expect(matchesKnownCaptionUrl(CAPTION_URL, [CAPTION_URL])).toBe(true);
    expect(
      matchesKnownCaptionUrl(`${CAPTION_URL}&extra=1`, [CAPTION_URL]),
    ).toBe(false);
    expect(matchesKnownCaptionUrl(CAPTION_URL, [])).toBe(false);
    expect(matchesKnownCaptionUrl("not a url", [CAPTION_URL])).toBe(false);
  });
});

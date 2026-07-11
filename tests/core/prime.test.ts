import { expect, test } from "vitest";
import {
  extractPrimeTracks,
  isPrimeCaptionUrl,
  looksLikePrimeCaptionBody,
} from "../../src/core/prime";

test("extracts Prime subtitle urls merged with timed text metadata", () => {
  const data = {
    subtitleUrls: [
      {
        timedTextTrackId: "t1",
        url: "https://www.primevideo.com/subtitles/en.vtt?x=1",
      },
      {
        timedTextTrackId: "t2",
        url: "https://www.primevideo.com/subtitles/zh.ttml2?x=1",
      },
    ],
    subtitleMetadata: {
      timedTextTracks: [
        {
          timedTextTrackId: "t1",
          languageCode: "en-US",
          displayName: "English",
        },
        {
          timedTextTrackId: "t2",
          languageCode: "zh-Hant",
          displayName: "Chinese Traditional",
        },
      ],
    },
  };

  expect(extractPrimeTracks(data)).toEqual([
    {
      baseUrl: "https://www.primevideo.com/subtitles/en.vtt?x=1",
      languageCode: "en-US",
      name: "English",
      kind: undefined,
    },
    {
      baseUrl: "https://www.primevideo.com/subtitles/zh.ttml2?x=1",
      languageCode: "zh-Hant",
      name: "Chinese Traditional",
      kind: undefined,
    },
  ]);
});

test("accepts direct subtitle entries with nested names", () => {
  expect(
    extractPrimeTracks({
      playback: {
        subtitles: [
          {
            languageCode: "ja-JP",
            name: { simpleText: "Japanese" },
            url: "https://cdn.example.invalid/opaque-track?id=1",
          },
        ],
      },
    }),
  ).toEqual([
    {
      baseUrl: "https://cdn.example.invalid/opaque-track?id=1",
      languageCode: "ja-JP",
      name: "Japanese",
      kind: undefined,
    },
  ]);
});

test("recognizes Prime caption urls and bodies", () => {
  expect(
    isPrimeCaptionUrl("https://www.primevideo.com/subtitle/en-US.ttml2?sig=1"),
  ).toBe(true);
  expect(isPrimeCaptionUrl("https://www.primevideo.com/image/poster.jpg")).toBe(
    false,
  );
  expect(
    looksLikePrimeCaptionBody("WEBVTT\n\n00:00.000 --> 00:01.000\nhi"),
  ).toBe(true);
  expect(
    looksLikePrimeCaptionBody(
      '<tt><body><div><p begin="1s" end="2s">hi</p></div></body></tt>',
    ),
  ).toBe(true);
});

test("extracts live Prime timedTextUrls result shape", () => {
  const data = {
    timedTextUrls: {
      result: {
        subtitleUrls: [
          {
            displayName: "Deutsch",
            languageCode: "de-de",
            trackGroupId: "subtitle-group",
            url: "https://cf-timedtext.aux.pv-cdn.net/3789/d937/918bdeab-b94e-4ef9-8c6b-8604fc814523.ttml2",
          },
        ],
        forcedNarrativeUrls: [
          {
            displayName: "Deutsch",
            languageCode: "de-de",
            trackGroupId: "forced-group",
            url: "https://cf-timedtext.aux.pv-cdn.net/3e34/0b76/7967d178-3b9a-4508-ac8a-66f1576bbab8.ttml2",
          },
        ],
      },
    },
  };

  expect(extractPrimeTracks(data)).toEqual([
    {
      baseUrl:
        "https://cf-timedtext.aux.pv-cdn.net/3789/d937/918bdeab-b94e-4ef9-8c6b-8604fc814523.ttml2",
      languageCode: "de-de",
      name: "Deutsch",
      kind: undefined,
    },
    {
      baseUrl:
        "https://cf-timedtext.aux.pv-cdn.net/3e34/0b76/7967d178-3b9a-4508-ac8a-66f1576bbab8.ttml2",
      languageCode: "de-de",
      name: "Deutsch",
      kind: undefined,
    },
  ]);
  expect(
    isPrimeCaptionUrl(
      "https://cf-timedtext.aux.pv-cdn.net/3789/d937/918bdeab-b94e-4ef9-8c6b-8604fc814523.ttml2",
    ),
  ).toBe(true);
});

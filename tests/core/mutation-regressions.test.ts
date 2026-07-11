import { expect, test } from "vitest";
import { parseWatchId } from "../../src/core/navigation";
import { parseJson3 } from "../../src/core/parse-json3";
import {
  parseCaptions,
  parseTimedText,
  parseTtml,
  parseWebVtt,
} from "../../src/core/parse";
import {
  extractPrimeTracks,
  isPrimeCaptionUrl,
  looksLikePrimeCaptionBody,
} from "../../src/core/prime";
import { pickTrack } from "../../src/core/track-select";

test("parseCaptions dispatches every supported caption format", () => {
  expect(
    parseCaptions(
      JSON.stringify({
        events: [
          { tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: "json3" }] },
        ],
      }),
    ),
  ).toEqual([{ start: 1, end: 1.5, text: "json3" }]);

  expect(parseCaptions("  WEBVTT\n\n00:01.000 --> 00:02.000\nvtt")).toEqual([
    { start: 1, end: 2, text: "vtt" },
  ]);
  expect(parseCaptions('  <tt><p begin="2s" dur="1s">ttml</p></tt>')).toEqual([
    { start: 2, end: 3, text: "ttml" },
  ]);
  expect(
    parseCaptions('<root><text start="3" dur="1">srv1</text></root>'),
  ).toEqual([{ start: 3, end: 4, text: "srv1" }]);
});

test("parseTimedText rejects invalid durations and sorts decimal timestamps", () => {
  const body = [
    '<text start="2.5" dur="0.5">later</text>',
    '<text start="1.25" dur=".">invalid</text>',
    '<text start="1.5" dur="0.25"> earlier &amp; valid </text>',
  ].join("");

  expect(parseTimedText(body)).toEqual([
    { start: 1.5, end: 1.75, text: "earlier & valid" },
    { start: 2.5, end: 3, text: "later" },
  ]);
});

test("parseWebVtt handles headers, CRLF, cue ids, timestamp variants, and sorting", () => {
  const body =
    "\uFEFFWEBVTT metadata\r\n\r\n" +
    "NOTE 00:00:00.000 --> 00:00:09.000\r\nignored\r\n\r\n" +
    "STYLE\r\n::cue { color: red }\r\n\r\n" +
    "REGION\r\nid:fred\r\n\r\n" +
    "late\r\n01:02:03,500 --> 01:02:04.250 align:start\r\n<b>Later</b><br>line\r\n\r\n" +
    "early\r\n02:01.500 --> 02:02.000\r\nEarly &amp; clean";

  expect(parseWebVtt(body)).toEqual([
    { start: 121.5, end: 122, text: "Early & clean" },
    { start: 3723.5, end: 3724.25, text: "Later\nline" },
  ]);
});

test("parseWebVtt skips malformed, reversed, and empty cues", () => {
  const body = `WEBVTT

no timing here

00:bad --> 00:02.000
bad start

00:03.000 --> 00:02.000
reversed

00:04.000 --> 00:05.000
<i></i>

00:06.000 --> broken
bad end`;

  expect(parseWebVtt(body)).toEqual([]);
});

test("parseTtml supports quoted attributes and all time units", () => {
  const body = `<tt><body>
    <p BEGIN='1m' dur="500ms"><span>minute</span></p>
    <p begin="1h" end="1h"><span>zero</span></p>
    <p begin="2s" end="3.25s">seconds</p>
    <p begin="00:01.250" dur="00:00.250">clock</p>
  </body></tt>`;

  expect(parseTtml(body)).toEqual([
    { start: 1.25, end: 1.5, text: "clock" },
    { start: 2, end: 3.25, text: "seconds" },
    { start: 60, end: 60.5, text: "minute" },
  ]);
});

test("parseTtml skips incomplete, invalid, reversed, and empty rows", () => {
  const body = `<tt>
    <p end="2s">missing begin</p>
    <p begin="1s">missing end</p>
    <p begin="bad" end="2s">bad begin</p>
    <p begin="2s" end="1s">reversed</p>
    <p begin="1s" dur="0s">zero</p>
    <p begin="1s" end="2s"><span></span></p>
  </tt>`;

  expect(parseTtml(body)).toEqual([]);
});

test("parseJson3 skips malformed event fields and sorts unsorted cues", () => {
  const body = `{
    "events": [
      null,
      "not an event",
      {"tStartMs": 4000, "dDurationMs": 1000, "segs": [{}, {"utf8": " later "}]},
      {"tStartMs": "0", "dDurationMs": 1000, "segs": [{"utf8": "bad start"}]},
      {"tStartMs": 0, "dDurationMs": "1000", "segs": [{"utf8": "bad duration"}]},
      {"tStartMs": 0, "dDurationMs": -1, "segs": [{"utf8": "negative"}]},
      {"tStartMs": 1000, "dDurationMs": 500, "segs": [{"utf8": "first"}]}
    ]
  }`;

  expect(parseJson3(body)).toEqual([
    { start: 1, end: 1.5, text: "first" },
    { start: 4, end: 5, text: "later" },
  ]);
  expect(parseJson3("null")).toEqual([]);
  expect(parseJson3("[]")).toEqual([]);
  expect(parseJson3('{"events":{}}')).toEqual([]);
});

test("Prime caption recognizers distinguish supported payloads from lookalikes", () => {
  for (const url of [
    "https://cdn.example/subtitle/en",
    "https://cdn.example/CAPTION/en",
    "https://cdn.example/timedtext?id=1",
    "https://cdn.example/file.dfxp",
    "https://cdn.example/file.vtt?x=1",
  ]) {
    expect(isPrimeCaptionUrl(url)).toBe(true);
  }
  expect(isPrimeCaptionUrl("https://cdn.example/subtitleimage.jpg")).toBe(
    false,
  );
  expect(isPrimeCaptionUrl("https://cdn.example/poster.jpg")).toBe(false);

  expect(
    looksLikePrimeCaptionBody("  WEBVTT\n\n00:00.000 --> 00:01.000\ntext"),
  ).toBe(true);
  expect(
    looksLikePrimeCaptionBody('  <tt xmlns="urn:ttml"><body /></tt>'),
  ).toBe(true);
  expect(
    looksLikePrimeCaptionBody('<wrapper><tt xml:lang="en"></tt></wrapper>'),
  ).toBe(true);
  expect(looksLikePrimeCaptionBody('<p begin="1s" end="2s">text</p>')).toBe(
    true,
  );
  expect(looksLikePrimeCaptionBody("<p>ordinary html</p>")).toBe(false);
  expect(looksLikePrimeCaptionBody("plain text")).toBe(false);
});

test("extractPrimeTracks handles invalid roots and cyclic records", () => {
  expect(extractPrimeTracks(null)).toEqual([]);
  expect(extractPrimeTracks("captions")).toEqual([]);
  expect(extractPrimeTracks({})).toEqual([]);

  const cyclic: Record<string, unknown> = {
    language: "en-GB",
    href: "https://cdn.example/caption/en.vtt",
  };
  cyclic.self = cyclic;
  expect(extractPrimeTracks(cyclic)).toEqual([
    {
      baseUrl: "https://cdn.example/caption/en.vtt",
      languageCode: "en-GB",
      name: undefined,
      kind: undefined,
    },
  ]);
});

test("extractPrimeTracks trims nested values and derives languages from urls", () => {
  const tracks = extractPrimeTracks({
    tracks: [
      {
        subtitle_url: "  https://cdn.example/opaque?id=1&language=fr-FR  ",
        languageName: { displayName: " Français " },
        trackType: { value: "forced" },
      },
      {
        timedTextURL: "https://cdn.example/opaque?id=2&locale=es-ES",
        label: { text: "Español" },
      },
      {
        src: "/relative/caption.vtt",
        languageCode: "ignored",
      },
    ],
  });

  expect(tracks).toEqual([
    {
      baseUrl: "https://cdn.example/opaque?id=1&language=fr-FR",
      languageCode: "fr-FR",
      name: "Français",
      kind: "forced",
    },
    {
      baseUrl: "https://cdn.example/opaque?id=2&locale=es-ES",
      languageCode: "es-ES",
      name: "Español",
      kind: undefined,
    },
  ]);
});

test("extractPrimeTracks merges split records and de-duplicates language/url pairs", () => {
  const tracks = extractPrimeTracks({
    metadata: [
      {
        timedTextTrackId: "same",
        language_code: "EN-us",
        description: "English",
      },
      {
        trackId: "same",
        opaqueCaptionLocation: "https://cdn.example/caption/en.vtt",
        subtype: "sdh",
      },
    ],
    duplicates: [
      {
        lang: "en-US",
        url: "https://cdn.example/caption/en.vtt",
        name: "duplicate",
      },
      {
        lang: "en-US",
        url: "https://cdn.example/caption/en-2.vtt",
        name: "alternate",
      },
    ],
  });

  expect(tracks).toEqual([
    {
      baseUrl: "https://cdn.example/caption/en.vtt",
      languageCode: "EN-us",
      name: "English",
      kind: "sdh",
    },
    {
      baseUrl: "https://cdn.example/caption/en-2.vtt",
      languageCode: "en-US",
      name: "alternate",
      kind: undefined,
    },
  ]);
});

test("parseWatchId rejects partial path matches and Prime-shaped urls on other hosts", () => {
  expect(parseWatchId("https://youtu.be/prefix/video-id")).toBeNull();
  expect(parseWatchId("https://youtu.be/video-id/extra")).toBeNull();
  expect(
    parseWatchId("https://www.youtube.com/not-shorts/video-id"),
  ).toBeNull();
  expect(parseWatchId("https://example.com/detail/prime-id")).toBeNull();
  expect(
    parseWatchId("https://example.com/region/fe/detail/prime-id"),
  ).toBeNull();
});

test("an empty selector cannot select a malformed empty-language track", () => {
  expect(
    pickTrack(
      [{ baseUrl: "https://example.invalid/caption", languageCode: "" }],
      "",
    ),
  ).toBeNull();
});

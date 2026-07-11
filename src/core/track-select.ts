import type { CaptionTrack } from "./types";

// A box's language is stored as a "selector" string: a languageCode, optionally
// prefixed with `asr:` to target YouTube's auto-generated track for that language
// (a video can have both a human "en" track and an "en" asr track).
export function parseSelector(sel: string): { lang: string; asr: boolean } {
  if (sel.startsWith("asr:"))
    return { lang: sel.slice(4).toLowerCase(), asr: true };
  return { lang: sel.toLowerCase(), asr: false };
}

export function selectorForTrack(t: {
  languageCode: string;
  kind?: string;
}): string {
  return t.kind === "asr" ? `asr:${t.languageCode}` : t.languageCode;
}

// Decide whether a captured timedtext response — identified by its language and
// whether it's the auto/asr track — should feed the box that resolved to `want` for
// `selector`. Language must equal the resolved track's languageCode.
//
// Kind is deliberately asymmetric: an explicit `asr:` selector requires the auto
// track, but a PLAIN selector accepts EITHER kind. Auto-generated captions are still
// that language, and right after an SPA navigation the player frequently exposes only
// the asr variant of the wanted language for a beat. With strict kind equality the box
// wants the human track, the asr capture is dropped, and the box stays empty until the
// user toggles CC off/on — the reported bug. Accepting the asr capture fills the box.
export function captureMatchesBox(
  selector: string,
  want: CaptionTrack,
  capLang: string,
  capAsr: boolean,
): boolean {
  const langOk = want.languageCode.toLowerCase() === capLang.toLowerCase();
  const kindOk = parseSelector(selector).asr ? capAsr : true;
  return langOk && kindOk;
}

// Resolve a selector to one of the video's tracks. Exact languageCode wins, else the
// primary subtag (e.g. 'zh-Hant' → 'zh'). Within the matched-language pool, prefer the
// requested kind (asr vs human); fall back to whatever exists so a plain selector still
// shows captions on an asr-only video. Returns null when no track has that language.
export function pickTrack(
  tracks: CaptionTrack[],
  sel: string,
): CaptionTrack | null {
  if (!sel) return null;
  const { lang, asr } = parseSelector(sel);
  const exact = tracks.filter((t) => t.languageCode.toLowerCase() === lang);
  const primary = lang.split("-")[0];
  const pool = exact.length
    ? exact
    : tracks.filter(
        (t) => t.languageCode.toLowerCase().split("-")[0] === primary,
      );
  if (!pool.length) return null;
  return pool.find((t) => (t.kind === "asr") === asr) ?? pool[0]!;
}

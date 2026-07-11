import { parseWatchId } from "../core/navigation";
import {
  extractPrimeTracks,
  isPrimeCaptionUrl,
  looksLikePrimeCaptionBody,
} from "../core/prime";
import type {
  CaptionTrackRaw,
  LoadRequest,
  ProviderHooks,
  SiteProviderFactory,
} from "./types";

const RESPONSE_HINT =
  /(?:getplaybackresources|playback|subtitle|caption|timedtext|ttml|webvtt|dfxp|\.vtt|\.ttml|\.ttml2)/i;

export const primeVideoProvider: SiteProviderFactory = {
  matches: (hostname) => hostname.endsWith("primevideo.com"),
  create: (hooks) => createPrimeVideoProvider(hooks),
};

function createPrimeVideoProvider(hooks: ProviderHooks) {
  let tracks: CaptionTrackRaw[] = [];
  let tracksKey = "";
  let videoId = parseWatchId(location.href);

  function publishSnapshot(): boolean {
    const id = parseWatchId(location.href);
    if (!id || tracks.length === 0) return false;
    videoId = id;
    return hooks.publish({
      videoDetails: { videoId: id },
      captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
    });
  }

  function setTracks(nextTracks: CaptionTrackRaw[]): void {
    const key = JSON.stringify(
      nextTracks.map((t) => [
        t.languageCode,
        t.kind ?? "",
        t.baseUrl,
        t.name?.simpleText ?? "",
      ]),
    );
    if (key === tracksKey) return;
    tracksKey = key;
    tracks = nextTracks;
    if (publishSnapshot()) {
      hooks.debug(
        "prime tracks",
        tracks.map((t) => `${t.languageCode}:${t.name?.simpleText ?? ""}`),
      );
      hooks.notifyTracksChanged();
    }
  }

  function maybeUpdateTracks(body: string): void {
    const trimmed = body.trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return;
    }
    const found = extractPrimeTracks(data).map((track): CaptionTrackRaw => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      name: { simpleText: track.name ?? track.languageCode },
      kind: track.kind,
    }));
    if (found.length > 0) setTracks(found);
  }

  function findTrack(url: string): CaptionTrackRaw | undefined {
    return tracks.find((track) => sameUrl(track.baseUrl, url));
  }

  function pickTrack(request: LoadRequest): CaptionTrackRaw | undefined {
    const lang = request.languageCode?.toLowerCase();
    if (!lang) return undefined;
    const exact = tracks.filter(
      (track) => track.languageCode.toLowerCase() === lang,
    );
    const primary = lang.split("-")[0];
    const pool = exact.length
      ? exact
      : tracks.filter(
          (track) => track.languageCode.toLowerCase().split("-")[0] === primary,
        );
    if (!pool.length) return undefined;
    return (
      pool.find((track) => (track.kind === "asr") === !!request.asr) ?? pool[0]
    );
  }

  async function load(request: LoadRequest): Promise<void> {
    const track = pickTrack(request);
    if (!track) return;
    const meta = {
      languageCode: track.languageCode,
      videoId: videoId ?? parseWatchId(location.href),
      asr: track.kind === "asr",
    };
    try {
      const response = await fetch(track.baseUrl, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      hooks.forwardCaption(track.baseUrl, body, meta);
    } catch (error) {
      hooks.debug("prime fetch failed", track.languageCode, String(error));
      hooks.requestCaptionFetch?.(track.baseUrl, meta);
    }
  }

  function processResponse(url: string, body: string): void {
    const track = findTrack(url);
    if (track || isPrimeCaptionUrl(url) || looksLikePrimeCaptionBody(body)) {
      hooks.forwardCaption(url, body, {
        languageCode: track?.languageCode,
        videoId: videoId ?? parseWatchId(location.href),
        asr: track?.kind === "asr",
      });
    }
    maybeUpdateTracks(body);
  }

  return {
    name: "prime-video",
    start: () => {
      setInterval(() => {
        const next = parseWatchId(location.href);
        if (next === videoId) return;
        videoId = next;
        tracks = [];
        tracksKey = "";
      }, 1000);
    },
    onReady: publishSnapshot,
    load,
    shouldReadFetchResponse: (url: string, response: Response) => {
      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      return (
        RESPONSE_HINT.test(url) ||
        contentType.includes("json") ||
        contentType.includes("text") ||
        contentType.includes("xml") ||
        contentType.includes("vtt") ||
        contentType.includes("ttml")
      );
    },
    shouldReadXhrResponse: (url: string) => RESPONSE_HINT.test(url),
    processResponse,
  };
}

function sameUrl(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return new URL(a, location.href).href === new URL(b, location.href).href;
  } catch {
    return false;
  }
}

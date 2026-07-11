// Runs in the page's MAIN world (manifest "world": "MAIN"). The common bridge
// selects a provider for the current site, then wires shared publishing,
// response-capture, replay, and load-request plumbing around it.
import { primeVideoProvider } from "./providers/prime-video";
import type {
  BridgeMessage,
  CaptionMeta,
  CaptionMsg,
  PlayerResponse,
  SiteProviderFactory,
} from "./providers/types";
import { youtubeProvider } from "./providers/youtube";

const ATTR = "data-dual-subs-pr";
const dlog = (...args: unknown[]) => {
  try {
    if (localStorage.getItem("dualSubsDebug") === "1")
      console.log("[uds.bridge]", ...args);
  } catch {
    // debug only
  }
};

const factories: SiteProviderFactory[] = [youtubeProvider, primeVideoProvider];
const buffer: CaptionMsg[] = [];

function publish(response: PlayerResponse): boolean {
  if (!response) return false;
  try {
    document.documentElement.setAttribute(ATTR, JSON.stringify(response));
    return true;
  } catch {
    return false;
  }
}

function forwardCaption(
  url: string,
  body: string,
  meta: CaptionMeta = {},
): void {
  if (!body) return;
  const message: CaptionMsg = { __dualSubsCaption: true, url, body, ...meta };
  buffer.push(message);
  if (buffer.length > 12) buffer.shift();
  dlog(
    "forward caption",
    meta.languageCode ?? "",
    "len",
    body.length,
    "buf",
    buffer.length,
  );
  window.postMessage(message, "*");
}

function replayBuffered(): void {
  dlog("replay", buffer.length, "buffered msg(s)");
  for (const message of buffer) window.postMessage(message, "*");
}

const provider = factories
  .find((factory) => factory.matches(location.hostname))
  ?.create({
    debug: dlog,
    forwardCaption,
    notifyTracksChanged: () =>
      window.postMessage({ __dualSubsTracksChanged: true }, "*"),
    publish,
    requestCaptionFetch: (url, meta = {}) =>
      window.postMessage(
        { __dualSubsFetchViaExtension: true, url, ...meta },
        "*",
      ),
  });

provider?.start();

const origFetch = window.fetch;
window.fetch = function (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : String(input);
  const promise = origFetch.apply(window, [input, init]);
  void promise
    .then((response) => {
      if (!provider?.shouldReadFetchResponse(url, response)) return;
      void response
        .clone()
        .text()
        .then((body) => provider.processResponse(url, body))
        .catch(() => {});
    })
    .catch(() => {});
  return promise;
};

const origOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: unknown[]
): void {
  const href = String(url);
  if (provider?.shouldReadXhrResponse(href)) {
    this.addEventListener("load", () => {
      try {
        if (typeof this.responseText === "string")
          provider.processResponse(href, this.responseText);
      } catch {
        // Non-text response.
      }
    });
  }
  (origOpen as (...args: unknown[]) => void).apply(this, [
    method,
    url,
    ...rest,
  ]);
} as XMLHttpRequest["open"];

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || !event.data) return;
  const data = event.data as BridgeMessage;
  if (data.__dualSubsReady) {
    provider?.onReady?.();
    replayBuffered();
    return;
  }
  const request = data.__dualSubsLoad;
  if (!request?.languageCode) return;
  void provider?.load(request);
});

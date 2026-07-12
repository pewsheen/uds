import { canProxyCaptionRequest } from "./adapters/caption-proxy";

type FetchCaptionMessage = { type?: string; url?: string };
type FetchCaptionResponse =
  | { ok: true; status: number; body: string; contentType: string }
  | { ok: false; status?: number; error: string };

const ALLOWED_HOSTS = new Set(["cf-timedtext.aux.pv-cdn.net"]);

chrome.runtime.onMessage.addListener(
  (
    message: FetchCaptionMessage,
    sender,
    sendResponse: (response: FetchCaptionResponse) => void,
  ) => {
    if (message?.type !== "uds:fetchCaption") return false;
    void (async () => {
      try {
        const url = new URL(message.url ?? "");
        const senderUrl = sender.tab?.url ?? sender.url;
        if (
          sender.id !== chrome.runtime.id ||
          !canProxyCaptionRequest(senderUrl, url.href) ||
          !ALLOWED_HOSTS.has(url.hostname)
        ) {
          sendResponse({ ok: false, error: "Blocked subtitle host" });
          return;
        }
        const response = await fetch(url.href, { credentials: "include" });
        const body = await response.text();
        if (!response.ok) {
          sendResponse({
            ok: false,
            status: response.status,
            error: "HTTP " + response.status,
          });
          return;
        }
        sendResponse({
          ok: true,
          status: response.status,
          body,
          contentType: response.headers.get("content-type") ?? "",
        });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  },
);

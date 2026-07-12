const PRIME_PAGE_HOSTS = new Set(["www.primevideo.com", "fe.primevideo.com"]);
const CAPTION_HOST = "cf-timedtext.aux.pv-cdn.net";

export function canProxyCaptionRequest(
  senderUrl: string | undefined,
  captionUrl: string,
): boolean {
  const sender = parseUrl(senderUrl);
  const caption = parseUrl(captionUrl);
  return !!(
    sender &&
    sender.protocol === "https:" &&
    PRIME_PAGE_HOSTS.has(sender.hostname) &&
    !sender.username &&
    !sender.password &&
    (!sender.port || sender.port === "443") &&
    caption &&
    caption.protocol === "https:" &&
    caption.hostname === CAPTION_HOST &&
    !caption.username &&
    !caption.password &&
    (!caption.port || caption.port === "443")
  );
}

export function matchesKnownCaptionUrl(
  requestedUrl: string,
  knownUrls: readonly string[],
): boolean {
  const requested = parseUrl(requestedUrl)?.href;
  return (
    !!requested && knownUrls.some((url) => parseUrl(url)?.href === requested)
  );
}

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

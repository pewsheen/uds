// Supported video sites can swap titles without a document reload, so the extension
// must detect navigation itself. These pure helpers turn a URL into a stable
// "which video is this?" id and decide when that id changed in a way that should
// trigger per-video re-initialization.

/** The video id for a supported URL, or null when the URL is not a single video page. */
export function parseWatchId(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const v = u.searchParams.get("v");
  if (v) return v;
  // youtu.be/<id> short links and /shorts/<id> carry the id in the path.
  const m = u.pathname.match(/^\/(?:shorts\/)?([^/]+)$/);
  if (m && (u.hostname === "youtu.be" || u.pathname.startsWith("/shorts/")))
    return m[1] ?? null;
  if (u.hostname.endsWith("primevideo.com")) {
    const prime = u.pathname.match(
      /\/(?:(?:region\/[^/]+\/)?detail|gp\/video\/detail)\/([^/?#]+)/,
    );
    if (prime) return prime[1] ?? null;
  }
  return null;
}

/**
 * Whether a transition from `prev` to `next` video id should trigger re-init.
 * Arriving on a video (null -> id, or id -> different id) does; leaving a video
 * (id -> null, e.g. navigating to the home feed) does not -- we keep the boxes in
 * place rather than tearing down on every excursion off a watch page.
 */
export function videoChanged(
  prev: string | null,
  next: string | null,
): boolean {
  if (next === null) return false;
  return prev !== next;
}

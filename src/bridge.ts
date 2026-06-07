// Runs in the page's MAIN world (declared via manifest "world": "MAIN").
// The isolated-world content script cannot read page globals like
// `ytInitialPlayerResponse`, so this bridge copies the data into a DOM
// attribute that the content script can read.
const ATTR = 'data-dual-subs-pr'

function publish(): boolean {
  const pr = (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse
  if (!pr) return false
  try {
    document.documentElement.setAttribute(ATTR, JSON.stringify(pr))
    return true
  } catch {
    return false
  }
}

// `ytInitialPlayerResponse` may not exist the instant this runs; poll briefly.
if (!publish()) {
  let tries = 0
  const id = setInterval(() => {
    tries += 1
    if (publish() || tries > 100) clearInterval(id)
  }, 50)
}

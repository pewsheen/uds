import { createStorageAdapter } from '../adapters/storage'

const store = createStorageAdapter(chrome.storage.sync)
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

type TrackInfo = { languageCode: string; name?: string }

// Ask the active tab's content script which caption tracks the current video offers.
function queryTracks(): Promise<TrackInfo[]> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id
      if (id == null) { resolve([]); return }
      chrome.tabs.sendMessage(id, { type: 'dual-subs:getTracks' }, (resp: unknown) => {
        if (chrome.runtime.lastError || !Array.isArray(resp)) { resolve([]); return }
        resolve(resp as TrackInfo[])
      })
    })
  })
}

function fillSelect(sel: HTMLSelectElement, tracks: TrackInfo[], current: string) {
  sel.innerHTML = ''
  sel.add(new Option('(off)', ''))
  const seen = new Set<string>()
  for (const t of tracks) {
    sel.add(new Option(t.name ? `${t.name} (${t.languageCode})` : t.languageCode, t.languageCode))
    seen.add(t.languageCode)
  }
  // Preserve a previously-saved language even if this video doesn't offer it.
  if (current && !seen.has(current)) sel.add(new Option(`${current} (not on this video)`, current))
  sel.value = current
}

async function init() {
  const s = await store.load()
  ;($('enabled') as HTMLInputElement).checked = s.enabled
  ;($('native') as HTMLInputElement).checked = s.nativeSubtitles ?? false
  ;($('font') as HTMLInputElement).value = String(s.boxes[0].style.fontSizePx)

  const tracks = await queryTracks()
  fillSelect($('lang1') as HTMLSelectElement, tracks, s.boxes[0].lang)
  fillSelect($('lang2') as HTMLSelectElement, tracks, s.boxes[1].lang)
  $('hint').textContent = tracks.length
    ? `${tracks.length} subtitle track(s) on this video`
    : 'Open a YouTube video to list its subtitle tracks'

  $('save').addEventListener('click', () => {
    void (async () => {
      s.enabled = ($('enabled') as HTMLInputElement).checked
      s.nativeSubtitles = ($('native') as HTMLInputElement).checked
      s.boxes[0].lang = ($('lang1') as HTMLSelectElement).value
      s.boxes[1].lang = ($('lang2') as HTMLSelectElement).value
      const size = parseInt(($('font') as HTMLInputElement).value, 10) || 24
      s.boxes[0].style.fontSizePx = size
      s.boxes[1].style.fontSizePx = size
      await store.save(s)
      window.close()
    })()
  })
}
void init()

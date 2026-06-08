import { createStorageAdapter } from '../adapters/storage'
import { selectorForTrack } from '../core/track-select'

const store = createStorageAdapter(chrome.storage.sync)
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

type TrackInfo = { languageCode: string; name?: string; kind?: string }

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
    const value = selectorForTrack(t)
    sel.add(new Option(t.name ? `${t.name} (${t.languageCode})` : value, value))
    seen.add(value)
  }
  if (current && !seen.has(current)) sel.add(new Option(`${current} (not on this video)`, current))
  sel.value = current
}

async function init() {
  const s = await store.load()

  // Debounce writes: color/range fire 'input' rapidly and chrome.storage.sync
  // has write-rate quotas. content.ts applies changes live via storage.onChanged.
  let timer: number | undefined
  const scheduleSave = () => {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => { void store.save(s) }, 150) as unknown as number
  }

  const enabled = $<HTMLInputElement>('enabled')
  const native = $<HTMLInputElement>('native')
  enabled.checked = s.enabled
  native.checked = s.nativeSubtitles ?? false
  enabled.addEventListener('change', () => { s.enabled = enabled.checked; scheduleSave() })
  native.addEventListener('change', () => { s.nativeSubtitles = native.checked; scheduleSave() })

  const tracks = await queryTracks()
  $('hint').textContent = tracks.length
    ? `${tracks.length} subtitle track(s) on this video`
    : 'Open a YouTube video to list its subtitle tracks'

  s.boxes.forEach((box, i) => {
    const lang = $<HTMLSelectElement>(`lang${i}`)
    const color = $<HTMLInputElement>(`color${i}`)
    const bgColor = $<HTMLInputElement>(`bgColor${i}`)
    const bgOpacity = $<HTMLInputElement>(`bgOpacity${i}`)
    const bgOpacityVal = $(`bgOpacityVal${i}`)
    const size = $<HTMLInputElement>(`size${i}`)
    const outline = $<HTMLInputElement>(`outline${i}`)

    fillSelect(lang, tracks, box.lang)
    color.value = box.style.color
    bgColor.value = box.style.bgColor
    bgOpacity.value = String(Math.round(box.style.bgOpacity * 100))
    bgOpacityVal.textContent = `${bgOpacity.value}%`
    size.value = String(box.style.fontSizePx)
    outline.checked = box.style.outline

    lang.addEventListener('change', () => { box.lang = lang.value; scheduleSave() })
    color.addEventListener('input', () => { box.style.color = color.value; scheduleSave() })
    bgColor.addEventListener('input', () => { box.style.bgColor = bgColor.value; scheduleSave() })
    bgOpacity.addEventListener('input', () => {
      box.style.bgOpacity = Number(bgOpacity.value) / 100
      bgOpacityVal.textContent = `${bgOpacity.value}%`
      scheduleSave()
    })
    size.addEventListener('input', () => { box.style.fontSizePx = parseInt(size.value, 10) || 24; scheduleSave() })
    outline.addEventListener('change', () => { box.style.outline = outline.checked; scheduleSave() })
  })
}
void init()

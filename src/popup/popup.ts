import { createStorageAdapter } from '../adapters/storage'

const store = createStorageAdapter(chrome.storage.sync)
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function init() {
  const s = await store.load()
  ;($('enabled') as HTMLInputElement).checked = s.enabled
  ;($('lang1') as HTMLInputElement).value = s.boxes[0].lang
  ;($('lang2') as HTMLInputElement).value = s.boxes[1].lang
  ;($('font') as HTMLInputElement).value = String(s.boxes[0].style.fontSizePx)

  $('save').addEventListener('click', () => {
    void (async () => {
      s.enabled = ($('enabled') as HTMLInputElement).checked
      s.boxes[0].lang = ($('lang1') as HTMLInputElement).value || 'en'
      s.boxes[1].lang = ($('lang2') as HTMLInputElement).value || 'zh-Hant'
      const size = parseInt(($('font') as HTMLInputElement).value, 10) || 24
      s.boxes[0].style.fontSizePx = size
      s.boxes[1].style.fontSizePx = size
      await store.save(s)
      window.close()
    })()
  })
}
void init()

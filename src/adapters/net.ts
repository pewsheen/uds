export type Net = { fetchText: (url: string) => Promise<string> }

export function createNetAdapter(fetchFn: typeof fetch = fetch): Net {
  return {
    async fetchText(url) {
      const res = await fetchFn(url, { credentials: 'omit' })
      if (!res.ok) throw new Error(`timedtext fetch failed: ${res.status}`)
      return res.text()
    },
  }
}

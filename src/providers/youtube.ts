import { parseWatchId } from '../core/navigation'
import type { LoadRequest, PlayerResponse, ProviderHooks, SiteProviderFactory } from './types'

const TIMEDTEXT = '/api/timedtext'

type YtPlayer = {
  loadModule?: (module: string) => void
  setOption?: (module: string, option: string, value: unknown) => void
  getOption?: (module: string, option: string, args?: unknown) => unknown
}

export const youtubeProvider: SiteProviderFactory = {
  matches: (hostname) => hostname === 'youtu.be' || hostname.endsWith('youtube.com'),
  create: (hooks) => createYouTubeProvider(hooks),
}

function createYouTubeProvider(hooks: ProviderHooks) {
  function currentPlayerResponse(): PlayerResponse {
    const player = document.getElementById('movie_player') as unknown as { getPlayerResponse?: () => unknown } | null
    const fromApi = player?.getPlayerResponse?.()
    return (fromApi ?? (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse) as PlayerResponse
  }

  function publishCurrent(wantId: string | null): void {
    let tries = 0
    const attempt = () => {
      tries += 1
      const response = currentPlayerResponse()
      const id = response?.videoDetails?.videoId
      const stale = !!wantId && !!id && id !== wantId
      if (response && !stale) {
        hooks.publish(response)
        return
      }
      if (tries <= 100) setTimeout(attempt, 50)
    }
    attempt()
  }

  function load(request: LoadRequest): void {
    if (!request.languageCode) return
    const player = document.getElementById('movie_player') as unknown as YtPlayer | null
    if (!player) return
    try {
      player.loadModule?.('captions')
      const response = currentPlayerResponse() as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { languageCode?: string; kind?: string }[] } } } | undefined
      const responseTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      const list = ((responseTracks && responseTracks.length ? responseTracks : player.getOption?.('captions', 'tracklist', { includeAsr: true })) ?? []) as { languageCode?: string; kind?: string }[]
      const languageCode = request.languageCode
      const primary = languageCode.split('-')[0]
      const track = list.find((t) => t.languageCode === languageCode && (t.kind === 'asr') === !!request.asr)
        ?? list.find((t) => t.languageCode === languageCode)
        ?? list.find((t) => (t.languageCode ?? '').split('-')[0] === primary)
        ?? list[0]
      hooks.debug('youtube load', languageCode, 'asr', !!request.asr, 'list', list.length, 'chose', track?.languageCode, 'setOption', !!track)
      if (track) player.setOption?.('captions', 'track', track)
    } catch {
      // YouTube player internals change often; loading captions is best effort.
    }
  }

  return {
    name: 'youtube',
    start: () => {
      publishCurrent(parseWatchId(location.href))
      document.addEventListener('yt-navigate-finish', () => {
        hooks.debug('youtube nav-finish: republish wantId', parseWatchId(location.href))
        publishCurrent(parseWatchId(location.href))
      })
    },
    load,
    shouldReadFetchResponse: (url: string) => url.includes(TIMEDTEXT),
    shouldReadXhrResponse: (url: string) => url.includes(TIMEDTEXT),
    processResponse: (url: string, body: string) => {
      if (url.includes(TIMEDTEXT)) hooks.forwardCaption(url, body)
    },
  }
}

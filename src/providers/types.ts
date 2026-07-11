export type CaptionTrackRaw = {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText?: string };
  kind?: string;
};

export type PlayerResponse =
  | {
      captions?: {
        playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrackRaw[] };
      };
      videoDetails?: { videoId?: string };
    }
  | undefined;

export type CaptionMeta = {
  languageCode?: string;
  videoId?: string | null;
  asr?: boolean;
};
export type CaptionMsg = {
  __dualSubsCaption: true;
  url: string;
  body: string;
} & CaptionMeta;
export type LoadRequest = { languageCode?: string; asr?: boolean };
export type BridgeMessage = {
  __dualSubsReady?: boolean;
  __dualSubsLoad?: LoadRequest;
};

export type ProviderHooks = {
  debug: (...args: unknown[]) => void;
  forwardCaption: (url: string, body: string, meta?: CaptionMeta) => void;
  notifyTracksChanged: () => void;
  publish: (response: PlayerResponse) => boolean;
  requestCaptionFetch?: (url: string, meta?: CaptionMeta) => void;
};

export type SiteProvider = {
  name: string;
  start: () => void;
  onReady?: () => void;
  load: (request: LoadRequest) => void | Promise<void>;
  shouldReadFetchResponse: (url: string, response: Response) => boolean;
  shouldReadXhrResponse: (url: string) => boolean;
  processResponse: (url: string, body: string) => void;
};

export type SiteProviderFactory = {
  matches: (hostname: string) => boolean;
  create: (hooks: ProviderHooks) => SiteProvider;
};

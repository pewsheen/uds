export type SubtitleVisibility = {
  uds: boolean;
  original: boolean;
};

export function decideSubtitleVisibility(
  playerCc: boolean,
  udsToggle: boolean,
  originalToggle: boolean,
): SubtitleVisibility {
  return {
    uds: playerCc && udsToggle,
    original: playerCc && originalToggle,
  };
}

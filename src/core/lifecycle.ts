import type { LifecycleEvent, LifecycleState } from "./types";

export function initLifecycle(): LifecycleState {
  return { kind: "idle" };
}

export function lifecycle(
  state: LifecycleState,
  event: LifecycleEvent,
): LifecycleState {
  switch (event.type) {
    case "enable":
      return state.kind === "idle" ? { kind: "loadingTracks" } : state;
    case "tracksLoaded":
      return state.kind === "loadingTracks" ? { kind: "active" } : state;
    case "failed":
      return { kind: "error", message: event.message };
    case "retry":
      return state.kind === "error" ? { kind: "loadingTracks" } : state;
    case "disable":
      return { kind: "idle" };
  }
}

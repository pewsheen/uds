import type { Anchor, Point, Rect, VEdge } from "./types";

export function resolveAnchor(point: Point, playerRect: Rect): Anchor {
  const inX =
    point.x >= playerRect.x && point.x <= playerRect.x + playerRect.width;
  const inY =
    point.y >= playerRect.y && point.y <= playerRect.y + playerRect.height;
  return inX && inY ? "video" : "page";
}

export function pickVerticalEdge(fy: number): VEdge {
  return fy < 0.5 ? "top" : "bottom";
}

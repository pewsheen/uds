import { mkdirSync } from "node:fs";
import path from "node:path";

const DIRECTORY = path.resolve("test-results/live");

export function evidencePath(name) {
  mkdirSync(DIRECTORY, { recursive: true });
  return path.join(DIRECTORY, name);
}

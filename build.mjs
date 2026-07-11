import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/popup", { recursive: true });

await build({
  entryPoints: [
    "src/content.ts",
    "src/bridge.ts",
    "src/background.ts",
    "src/popup/popup.ts",
  ],
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: "dist",
  outbase: "src",
  logLevel: "info",
});

cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/popup/popup.html", "dist/popup/popup.html");
cpSync("src/popup/moomay.css", "dist/popup/moomay.css");
console.log("built dist/");

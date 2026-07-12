import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/popup", { recursive: true });
mkdirSync("dist/icons", { recursive: true });

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
cpSync("src/popup/uds.css", "dist/popup/uds.css");
cpSync("src/icons", "dist/icons", { recursive: true });
console.log("built dist/");

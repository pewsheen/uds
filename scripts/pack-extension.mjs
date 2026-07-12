import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const EXPECTED_FILES = [
  "background.js",
  "bridge.js",
  "content.js",
  "icons/icon128.png",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "manifest.json",
  "popup/popup.html",
  "popup/popup.js",
  "popup/uds.css",
].sort();

const args = process.argv.slice(2);
let outputDirectory = "dist";
let skipBuild = false;

for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--") continue;
  if (arg === "--skip-build") {
    skipBuild = true;
    continue;
  }
  if (arg === "--out") {
    const value = args[++index];
    if (!value) throw new Error("--out requires a directory");
    outputDirectory = value;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (!skipBuild) {
  const result = spawnSync(process.execPath, ["build.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const distDirectory = path.resolve("dist");
const manifest = JSON.parse(
  readFileSync(path.join(distDirectory, "manifest.json"), "utf8"),
);
const version = String(manifest.version ?? "");
if (!/^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid manifest version: ${version}`);
}

const outputPath = path.resolve(outputDirectory, `uds-${version}.zip`);
const temporaryPath = `${outputPath}.tmp`;
const checksumPath = `${outputPath}.sha256`;
const temporaryChecksumPath = `${checksumPath}.tmp`;
const generatedPaths = new Set(
  [outputPath, temporaryPath, checksumPath, temporaryChecksumPath]
    .map((file) => path.relative(distDirectory, file).replaceAll("\\", "/"))
    .filter((file) => file && file !== ".." && !file.startsWith("../")),
);
const actualFiles = listFiles(distDirectory)
  .filter((file) => !generatedPaths.has(file))
  .sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_FILES)) {
  throw new Error(
    [
      "dist/ does not match the Chrome Web Store archive allow-list.",
      `Expected: ${EXPECTED_FILES.join(", ")}`,
      `Actual:   ${actualFiles.join(", ")}`,
    ].join("\n"),
  );
}

const zip = new JSZip();
const archiveDate = new Date("1980-01-01T00:00:00.000Z");
for (const name of EXPECTED_FILES) {
  zip.file(name, readFileSync(path.join(distDirectory, ...name.split("/"))), {
    createFolders: false,
    date: archiveDate,
    unixPermissions: 0o100644,
  });
}

mkdirSync(path.dirname(outputPath), { recursive: true });
rmSync(temporaryPath, { force: true });
writeFileSync(
  temporaryPath,
  await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  }),
);
rmSync(outputPath, { force: true });
renameSync(temporaryPath, outputPath);

const checksum = createHash("sha256")
  .update(readFileSync(outputPath))
  .digest("hex");
rmSync(temporaryChecksumPath, { force: true });
writeFileSync(
  temporaryChecksumPath,
  `${checksum}  ${path.basename(outputPath)}\n`,
);
rmSync(checksumPath, { force: true });
renameSync(temporaryChecksumPath, checksumPath);

console.log(`Packed ${path.relative(process.cwd(), outputPath)}`);
console.log(`SHA-256 ${checksum}`);
console.log(`Validated ${EXPECTED_FILES.length} extension files.`);

function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(path.join(directory, entry.name), relative));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unsupported dist entry: ${relative}`);
    }
  }
  return files;
}

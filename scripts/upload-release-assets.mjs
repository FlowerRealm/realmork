import fs from "node:fs/promises";
import path from "node:path";
import { repoRoot, run } from "./lib.mjs";

const tag = process.argv[2];

if (!tag) {
  throw new Error("usage: node scripts/upload-release-assets.mjs <tag>");
}

const releaseDir = path.join(repoRoot, "release");
const entries = await fs.readdir(releaseDir, { withFileTypes: true });
const allowedExtensions = new Set([".AppImage", ".deb", ".dmg", ".exe"]);
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(releaseDir, entry.name))
  .filter((filePath) => allowedExtensions.has(path.extname(filePath)));

if (files.length === 0) {
  throw new Error("no release assets were generated under release/");
}

await run("gh", ["release", "upload", tag, ...files, "--clobber"]);

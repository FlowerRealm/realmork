import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, repoRoot } from "./lib.mjs";

const sourceSvgPath = path.join(repoRoot, "assets", "icons", "realmork-app.svg");
const buildDir = path.join(repoRoot, "build");
const buildIconsDir = path.join(buildDir, "icons");
const publicDir = path.join(repoRoot, "public");
const linuxSizes = [16, 32, 48, 64, 128, 256, 512];
const faviconSizes = [16, 32, 48];

const imageMagick = resolveImageMagick();

await ensureDir(buildDir);
await ensureDir(buildIconsDir);
await ensureDir(publicDir);

for (const size of linuxSizes) {
  await renderPng(size, path.join(buildIconsDir, `${size}x${size}.png`));
}

await renderPng(180, path.join(publicDir, "apple-touch-icon.png"));

await fs.copyFile(path.join(buildIconsDir, "512x512.png"), path.join(buildDir, "icon.png"));
await fs.copyFile(path.join(buildIconsDir, "512x512.png"), path.join(publicDir, "app-icon.png"));
await fs.copyFile(path.join(buildIconsDir, "16x16.png"), path.join(publicDir, "favicon-16.png"));
await fs.copyFile(path.join(buildIconsDir, "32x32.png"), path.join(publicDir, "favicon-32.png"));
await fs.copyFile(sourceSvgPath, path.join(publicDir, "favicon.svg"));

runImageMagick([
  ...faviconSizes.map((size) => path.join(buildIconsDir, `${size}x${size}.png`)),
  path.join(publicDir, "favicon.ico")
]);

runImageMagick([
  ...linuxSizes.map((size) => path.join(buildIconsDir, `${size}x${size}.png`)),
  path.join(buildDir, "icon.ico")
]);

async function renderPng(size, outputPath) {
  runImageMagick([
    "-background",
    "none",
    sourceSvgPath,
    "-resize",
    `${size}x${size}`,
    `PNG32:${outputPath}`
  ]);
}

function resolveImageMagick() {
  for (const command of ["magick", "convert"]) {
    const result = spawnSync(command, ["-version"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe"
    });

    if (result.status === 0 && `${result.stdout}${result.stderr}`.includes("ImageMagick")) {
      return command;
    }
  }

  throw new Error("ImageMagick is required to regenerate icon assets. Install `magick` or `convert` first.");
}

function runImageMagick(args) {
  const result = spawnSync(imageMagick, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status === 0) {
    return;
  }

  const message = `${result.stderr}${result.stdout}`.trim() || `ImageMagick command failed: ${imageMagick} ${args.join(" ")}`;
  throw new Error(message);
}

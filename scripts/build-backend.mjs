import path from "node:path";
import fs from "node:fs/promises";
import { backendArtifactDirectoryName, backendBinaryName } from "../electron/backend-artifacts.js";
import { ensureDir, goEnvForTarget, hostBinaryName, repoRoot, run } from "./lib.mjs";

const mode = process.argv[2] ?? "current";

async function buildCurrent() {
  const outputDir = path.join(repoRoot, "dist", "bin");
  await ensureDir(outputDir);
  await run("go", ["build", "-o", path.join(outputDir, hostBinaryName()), "./cmd/homeworkd"]);
}

async function buildTarget(targetPlatform, targetArch, runtimePlatform, runtimeArch, destinationRoot) {
  const outputDir = path.join(destinationRoot, backendArtifactDirectoryName(runtimePlatform, runtimeArch));
  const outputPath = path.join(outputDir, backendBinaryName(runtimePlatform));
  await ensureDir(outputDir);
  await run("go", ["build", "-o", outputPath, "./cmd/homeworkd"], {
    env: goEnvForTarget(targetPlatform, targetArch)
  });
  await fs.access(outputPath);
}

if (mode === "current") {
  await buildCurrent();
  process.exit(0);
}

if (mode === "target") {
  const targetPlatform = process.argv[3];
  const targetArch = process.argv[4];
  const runtimePlatform = process.argv[5];
  const runtimeArch = process.argv[6];
  const destinationRoot = process.argv[7];

  if (!targetPlatform || !targetArch || !runtimePlatform || !runtimeArch || !destinationRoot) {
    throw new Error("usage: node scripts/build-backend.mjs target <goos> <goarch> <runtimePlatform> <runtimeArch> <destinationRoot>");
  }

  await buildTarget(targetPlatform, targetArch, runtimePlatform, runtimeArch, destinationRoot);
  process.exit(0);
}

throw new Error(`unsupported build mode: ${mode}`);

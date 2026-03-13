import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../", import.meta.url));

export function hostBinaryName() {
  return process.platform === "win32" ? "homeworkd.exe" : "homeworkd";
}

export function targetBinaryName(targetPlatform) {
  return targetPlatform === "win32" ? "homeworkd.exe" : "homeworkd";
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export function run(command, args, options = {}) {
  const executable = resolveExecutable(command);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
      ...options
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${executable} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

function resolveExecutable(command) {
  if (process.platform !== "win32") {
    return command;
  }

  if (command === "npm" || command === "npx") {
    return `${command}.cmd`;
  }

  return command;
}

export function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, value = "true"] = arg.slice(2).split("=", 2);
    options[key] = value;
  }

  return options;
}

export function goEnvForTarget(targetPlatform, targetArch) {
  return {
    ...process.env,
    CGO_ENABLED: "0",
    GOOS: targetPlatform,
    GOARCH: targetArch
  };
}

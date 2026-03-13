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
  const spawnSpec = resolveSpawnSpec(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
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
      reject(new Error(`${spawnSpec.displayCommand} failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

function resolveSpawnSpec(command, args) {
  if (process.platform !== "win32") {
    return {
      command,
      args,
      displayCommand: formatCommand(command, args)
    };
  }

  if (command === "npm" || command === "npx") {
    const cmd = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    const executable = `${command}.cmd`;
    const commandLine = [executable, ...args].map(quoteWindowsArg).join(" ");
    return {
      command: cmd,
      args: ["/d", "/s", "/c", commandLine],
      displayCommand: formatCommand(command, args)
    };
  }

  return {
    command,
    args,
    displayCommand: formatCommand(command, args)
  };
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function quoteWindowsArg(arg) {
  if (arg.length === 0) {
    return '""';
  }

  if (!/[ \t"]/u.test(arg)) {
    return arg;
  }

  let escaped = '"';
  let backslashes = 0;

  for (const char of arg) {
    if (char === "\\") {
      backslashes += 1;
      continue;
    }

    if (char === '"') {
      escaped += "\\".repeat(backslashes * 2 + 1);
      escaped += '"';
      backslashes = 0;
      continue;
    }

    escaped += "\\".repeat(backslashes);
    escaped += char;
    backslashes = 0;
  }

  escaped += "\\".repeat(backslashes * 2);
  escaped += '"';
  return escaped;
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

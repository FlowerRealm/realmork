import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

function runNode(args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: process.env,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${process.execPath} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

describe("build-backend script", () => {
  it("emits a Windows .exe into the runtime artifact directory", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "realmork-backend-"));

    try {
      await runNode(
        ["./scripts/build-backend.mjs", "target", "windows", "amd64", "win32", "x64", tempRoot],
        repoRoot
      );

      const artifactDir = path.join(tempRoot, "win32-x64");
      const files = await fs.readdir(artifactDir);

      expect(files).toContain("homeworkd.exe");
      expect(files).not.toContain("homeworkd");
      await expect(fs.access(path.join(artifactDir, "homeworkd.exe"))).resolves.toBeUndefined();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);
});

import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, parseArgs, removeDir, repoRoot, run } from "./lib.mjs";

const options = parseArgs(process.argv.slice(2));
const platform = options.platform;

const targetsByPlatform = {
  linux: [{ runtimePlatform: "linux", runtimeArch: "x64", goos: "linux", goarch: "amd64" }],
  win: [{ runtimePlatform: "win32", runtimeArch: "x64", goos: "windows", goarch: "amd64" }],
  mac: [
    { runtimePlatform: "darwin", runtimeArch: "x64", goos: "darwin", goarch: "amd64" },
    { runtimePlatform: "darwin", runtimeArch: "arm64", goos: "darwin", goarch: "arm64" }
  ]
};

if (!platform || !targetsByPlatform[platform]) {
  throw new Error("usage: node scripts/release.mjs --platform=<linux|win|mac>");
}

const releaseWorkspace = path.join(repoRoot, ".release-workspace");
const backendRoot = path.join(releaseWorkspace, "resources", "bin");

await removeDir(releaseWorkspace);
await removeDir(path.join(repoRoot, "release"));
await ensureDir(backendRoot);

await run("npm", ["run", "build:renderer"]);

for (const target of targetsByPlatform[platform]) {
  await run("node", [
    "./scripts/build-backend.mjs",
    "target",
    target.goos,
    target.goarch,
    target.runtimePlatform,
    target.runtimeArch,
    backendRoot
  ]);
}

await fs.cp(path.join(repoRoot, "dist"), path.join(releaseWorkspace, "dist"), { recursive: true });
await fs.cp(path.join(repoRoot, "electron"), path.join(releaseWorkspace, "electron"), { recursive: true });
await writeReleasePackageJson(releaseWorkspace);

const builderArgs = [
  "electron-builder",
  "--config",
  path.join(repoRoot, "electron-builder.yml"),
  "--publish",
  "never"
];

if (platform === "linux") {
  builderArgs.push("--linux", "AppImage", "deb");
  builderArgs.push("--x64");
} else if (platform === "win") {
  builderArgs.push("--win", "nsis");
  builderArgs.push("--x64");
} else {
  builderArgs.push("--mac", "dmg");
  builderArgs.push("--universal");
}

await run("npx", builderArgs, {
  cwd: releaseWorkspace,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? "false"
  }
});

async function writeReleasePackageJson(workspaceDir) {
  const rootPackage = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const electronVersion = rootPackage.devDependencies?.electron?.replace(/^[^\d]*/, "");
  const releasePackage = {
    name: rootPackage.name,
    version: rootPackage.version,
    description: rootPackage.description,
    author: rootPackage.author,
    homepage: rootPackage.homepage,
    repository: rootPackage.repository,
    main: rootPackage.main,
    type: rootPackage.type,
    devDependencies: {
      electron: electronVersion
    }
  };

  await fs.writeFile(path.join(workspaceDir, "package.json"), `${JSON.stringify(releasePackage, null, 2)}\n`);
}

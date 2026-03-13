import { app, BrowserWindow, Menu } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let backendProcess;
let mainWindow;
let backendInfoPromise;

const platformBinaryName = process.platform === "win32" ? "homeworkd.exe" : "homeworkd";

function configureApplicationMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }

  const menu = Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }]);
  Menu.setApplicationMenu(menu);
}

function resolveRendererEntry() {
  if (process.env.ELECTRON_RENDERER_URL) {
    return { type: "url", value: process.env.ELECTRON_RENDERER_URL };
  }

  if (!app.isPackaged) {
    return { type: "file", value: path.join(process.cwd(), "dist", "index.html") };
  }

  return { type: "file", value: path.join(app.getAppPath(), "dist", "index.html") };
}

function resolveBackendBinary() {
  if (!app.isPackaged) {
    return path.join(process.cwd(), "dist", "bin", platformBinaryName);
  }

  const arch = process.arch;
  const candidates = [path.join(process.resourcesPath, "bin", `${process.platform}-${arch}`, platformBinaryName)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`backend binary not found for ${process.platform}-${arch}`);
}

function waitForBackendPort(child) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: child.stdout });
    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error("backend start timeout"));
    }, 15000);

    child.on("exit", (code) => {
      clearTimeout(timeout);
      rl.close();
      reject(new Error(`backend exited early with code ${code}`));
    });

    rl.on("line", (line) => {
      if (!line.startsWith("READY ")) {
        return;
      }
      clearTimeout(timeout);
      rl.close();
      const port = Number.parseInt(line.replace("READY ", "").trim(), 10);
      if (Number.isNaN(port)) {
        reject(new Error(`invalid backend ready line: ${line}`));
        return;
      }
      resolve(port);
    });
  });
}

async function startBackend() {
  if (backendInfoPromise) {
    return backendInfoPromise;
  }

  const token = randomBytes(24).toString("hex");
  const quoteALAPIToken = process.env.REALMORK_ALAPI_TOKEN ?? "";
  const dataDir = app.getPath("userData");
  const binary = resolveBackendBinary();

  backendProcess = spawn(binary, ["-data-dir", dataDir, "-token", token, "-port", "0", "-quote-alapi-token", quoteALAPIToken], {
    cwd: path.dirname(binary),
    stdio: ["ignore", "pipe", "pipe"]
  });

  backendProcess.stderr.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      console.error(`[backend] ${message}`);
    }
  });

  backendInfoPromise = waitForBackendPort(backendProcess).then((port) => ({
    token,
    apiBaseUrl: `http://127.0.0.1:${port}`
  }));

  return backendInfoPromise;
}

async function createWindow() {
  const backend = await startBackend();
  const rendererEntry = resolveRendererEntry();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1366,
    minHeight: 840,
    backgroundColor: "#f7f1e9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [
        `--realmork-api-base-url=${backend.apiBaseUrl}`,
        `--realmork-api-token=${backend.token}`
      ]
    }
  });

  if (rendererEntry.type === "url") {
    await mainWindow.loadURL(rendererEntry.value);
  } else {
    await mainWindow.loadFile(rendererEntry.value);
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isToggleDevToolsShortcut =
      input.type === "keyDown" &&
      (input.key === "F12" || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i"));

    if (!isToggleDevToolsShortcut) {
      return;
    }

    event.preventDefault();
    mainWindow.webContents.toggleDevTools();
  });
}

app.whenReady().then(async () => {
  configureApplicationMenu();

  try {
    await createWindow();
  } catch (error) {
    console.error(error);
    app.quit();
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});

import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_STATE_EVENT = "realmork:backend-state";
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL ?? "";
const hasRendererDevServer = DEV_RENDERER_URL !== "";
const useDevelopmentBackend = hasRendererDevServer || process.env.NODE_ENV === "development";
const platformBinaryName = process.platform === "win32" ? "homeworkd.exe" : "homeworkd";

let backendProcess;
let mainWindow;
let backendReadyPromise;
let backendState = {
  status: "starting",
  apiBaseUrl: "",
  apiToken: "",
  error: ""
};
let backendRunID = 0;
let appQuitting = false;
let waitingForBackendShutdown = false;

function configureApplicationMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }

  const menu = Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }]);
  Menu.setApplicationMenu(menu);
}

function resolveRendererEntry() {
  if (DEV_RENDERER_URL) {
    return { type: "url", value: DEV_RENDERER_URL };
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

function snapshotBackendState() {
  return { ...backendState };
}

function broadcastBackendState() {
  const payload = snapshotBackendState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(BACKEND_STATE_EVENT, payload);
    }
  }
}

function setBackendState(status, patch = {}) {
  backendState = {
    status,
    apiBaseUrl: "",
    apiToken: "",
    error: "",
    ...patch
  };
  broadcastBackendState();
  return snapshotBackendState();
}

function invalidateBackendRun() {
  backendRunID += 1;
  backendReadyPromise = null;
}

async function stopBackendProcess() {
  const child = backendProcess;
  backendProcess = undefined;

  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let forceKillTimeout;

    function handleExit() {
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
      resolve();
    }

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      forceKillTimeout = setTimeout(() => {
        child.off("exit", handleExit);
        resolve();
      }, 1000);
    }, 5000);

    child.once("exit", handleExit);
    child.kill();
  });
}

function resolveBackendLaunch(token) {
  const quoteALAPIToken = process.env.REALMORK_ALAPI_TOKEN ?? "";
  const args = ["-data-dir", app.getPath("userData"), "-token", token, "-port", "0"];

  if (quoteALAPIToken) {
    args.push("-quote-alapi-token", quoteALAPIToken);
  }

  if (useDevelopmentBackend) {
    return {
      command: "go",
      args: ["run", "./cmd/homeworkd", ...args],
      cwd: process.cwd()
    };
  }

  const binary = resolveBackendBinary();
  return {
    command: binary,
    args,
    cwd: path.dirname(binary)
  };
}

function describeExit(code, signal) {
  if (signal) {
    return `signal ${signal}`;
  }
  if (typeof code === "number") {
    return `code ${code}`;
  }
  return "unknown reason";
}

function waitForBackendPort(child) {
  return new Promise((resolve, reject) => {
    if (!child.stdout) {
      reject(new Error("backend stdout unavailable"));
      return;
    }

    const rl = readline.createInterface({ input: child.stdout });
    let settled = false;

    const settle = (handler) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      rl.close();
      child.off("error", onError);
      child.off("exit", onExit);
      handler(value);
    };

    const resolveOnce = settle(resolve);
    const rejectOnce = settle(reject);
    const timeout = setTimeout(() => {
      rejectOnce(new Error("backend start timeout"));
    }, 15000);

    function onError(error) {
      rejectOnce(error);
    }

    function onExit(code, signal) {
      rejectOnce(new Error(`backend exited before ready (${describeExit(code, signal)})`));
    }

    child.once("error", onError);
    child.once("exit", onExit);

    rl.on("line", (line) => {
      if (!line.startsWith("READY ")) {
        return;
      }
      const port = Number.parseInt(line.replace("READY ", "").trim(), 10);
      if (Number.isNaN(port)) {
        rejectOnce(new Error(`invalid backend ready line: ${line}`));
        return;
      }
      resolveOnce(port);
    });
  });
}

function trackBackendProcess(child, runID) {
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        console.error(`[backend] ${message}`);
      }
    });
  }

  child.on("exit", (code, signal) => {
    if (appQuitting || runID !== backendRunID) {
      return;
    }

    backendProcess = undefined;
    backendReadyPromise = null;

    if (backendState.status === "starting") {
      return;
    }

    setBackendState("error", {
      error: `本地服务已退出（${describeExit(code, signal)}）`
    });
  });
}

function launchBackend() {
  const runID = backendRunID + 1;
  backendRunID = runID;
  const token = randomBytes(24).toString("hex");
  const backendLaunch = resolveBackendLaunch(token);

  setBackendState("starting");
  backendProcess = spawn(backendLaunch.command, backendLaunch.args, {
    cwd: backendLaunch.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  trackBackendProcess(backendProcess, runID);

  backendReadyPromise = waitForBackendPort(backendProcess)
    .then((port) => {
      if (runID !== backendRunID) {
        throw new Error("stale backend launch");
      }

      return setBackendState("ready", {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        apiToken: token
      });
    })
    .catch((error) => {
      if (runID === backendRunID && !appQuitting) {
        backendProcess = undefined;
        setBackendState("error", {
          error: error instanceof Error ? error.message : "backend start failed"
        });
      }
      throw error;
    });

  return backendReadyPromise;
}

function ensureBackendStarted() {
  if (backendState.status === "ready") {
    return Promise.resolve(snapshotBackendState());
  }

  if (backendReadyPromise) {
    return backendReadyPromise;
  }

  return launchBackend();
}

async function waitForRenderer(window) {
  while (!window.isDestroyed()) {
    try {
      const response = await fetch(DEV_RENDERER_URL, {
        cache: "no-store"
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Renderer dev server is still warming up.
    }

    await delay(200);
  }
}

async function loadBootPage(window, state = "loading") {
  await window.loadFile(path.join(__dirname, "boot.html"), {
    query: { state }
  });
}

async function attachDevelopmentRenderer(window) {
  if (!DEV_RENDERER_URL) {
    return;
  }

  try {
    await waitForRenderer(window);
    if (!window.isDestroyed()) {
      await window.loadURL(DEV_RENDERER_URL);
    }
  } catch (error) {
    console.error("failed to attach development renderer", error);
  }
}

async function loadInitialPage(window) {
  if (hasRendererDevServer) {
    await loadBootPage(window);
    void attachDevelopmentRenderer(window);
    return;
  }

  const rendererEntry = resolveRendererEntry();
  if (rendererEntry.type === "url") {
    await window.loadURL(rendererEntry.value);
    return;
  }

  await window.loadFile(rendererEntry.value);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1366,
    minHeight: 840,
    backgroundColor: "#edf3f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  await loadInitialPage(mainWindow);

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

  mainWindow.on("closed", () => {
    if (mainWindow?.isDestroyed()) {
      mainWindow = undefined;
    }
  });
}

ipcMain.handle("realmork:get-backend-state", () => snapshotBackendState());

ipcMain.handle("realmork:wait-for-backend", async () => {
  if (backendState.status === "ready") {
    return snapshotBackendState();
  }

  if (backendState.status === "error") {
    throw new Error(backendState.error || "backend unavailable");
  }

  return ensureBackendStarted();
});

ipcMain.handle("realmork:retry-backend-start", async () => {
  invalidateBackendRun();
  await stopBackendProcess();
  return launchBackend();
});

app.whenReady().then(async () => {
  configureApplicationMenu();
  void ensureBackendStarted().catch((error) => {
    console.error(error);
  });

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

app.on("before-quit", (event) => {
  if (waitingForBackendShutdown) {
    return;
  }

  waitingForBackendShutdown = true;
  event.preventDefault();
  appQuitting = true;
  invalidateBackendRun();

  void stopBackendProcess().finally(() => {
    app.quit();
  });
});

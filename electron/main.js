import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_STATE_EVENT = "realmork:backend-state";
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL ?? "";
const hasRendererDevServer = DEV_RENDERER_URL !== "";
const useDevelopmentBackend = process.env.NODE_ENV === "development";

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

function resolveBackendBinary() {
  return path.join(process.cwd(), "dist", "bin", process.platform === "win32" ? "homeworkd.exe" : "homeworkd");
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

function stopBackendProcess() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = undefined;
}

function resolveBackendLaunch(token) {
  const args = ["-data-dir", app.getPath("userData"), "-token", token, "-port", "0"];

  if (useDevelopmentBackend) {
    return {
      command: "go",
      args: ["run", "./cmd/homeworkd", ...args]
    };
  }

  return {
    command: resolveBackendBinary(),
    args
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
    cwd: process.cwd(),
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
    } catch (error) {
      // Renderer dev server is still warming up.
    }

    await delay(200);
  }
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
    if (!window.isDestroyed()) {
      console.error("failed to attach development renderer", error);
    }
  }
}

async function loadInitialPage(window) {
  if (hasRendererDevServer) {
    await window.loadFile(path.join(__dirname, "boot.html"));
    void attachDevelopmentRenderer(window);
    return;
  }

  await window.loadFile(path.join(process.cwd(), "dist", "index.html"));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1366,
    minHeight: 840,
    backgroundColor: "#ece7dc",
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
  stopBackendProcess();
  return launchBackend();
});

app.whenReady().then(async () => {
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

app.on("before-quit", () => {
  appQuitting = true;
  invalidateBackendRun();
  stopBackendProcess();
});

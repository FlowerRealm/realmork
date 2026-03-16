export function launchBackendProcess({
  runID,
  token,
  resolveBackendLaunch,
  spawnProcess,
  processEnv,
  setBackendState,
  setBackendProcess,
  trackBackendProcess,
  waitForBackendPort,
  isCurrentRun,
  isAppQuitting
}) {
  let child;

  try {
    const backendLaunch = resolveBackendLaunch(token);
    setBackendState("starting");
    child = spawnProcess(backendLaunch.command, backendLaunch.args, {
      cwd: backendLaunch.cwd,
      env: processEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    setBackendProcess(child);
    trackBackendProcess(child, runID);
  } catch (error) {
    setBackendProcess(undefined);
    const failure = error instanceof Error ? error : new Error("backend start failed");
    setBackendState("error", {
      error: failure.message
    });
    return Promise.reject(failure);
  }

  return waitForBackendPort(child)
    .then((port) => {
      if (!isCurrentRun(runID)) {
        throw new Error("stale backend launch");
      }

      return setBackendState("ready", {
        apiBaseUrl: `http://127.0.0.1:${port}`,
        apiToken: token
      });
    })
    .catch((error) => {
      if (isCurrentRun(runID) && !isAppQuitting()) {
        setBackendProcess(undefined);
        setBackendState("error", {
          error: error instanceof Error ? error.message : "backend start failed"
        });
      }
      throw error;
    });
}

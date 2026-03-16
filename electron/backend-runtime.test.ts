import { launchBackendProcess } from "./backend-runtime.js";

describe("launchBackendProcess", () => {
  it("surfaces packaged backend lookup failures as backend error state", async () => {
    const setBackendState = vi.fn((status: string, patch: Record<string, string> = {}) => ({
      status,
      apiBaseUrl: "",
      apiToken: "",
      error: "",
      ...patch
    }));
    const setBackendProcess = vi.fn();
    const trackBackendProcess = vi.fn();
    const waitForBackendPort = vi.fn();
    const failure = new Error("backend binary not found for win32-x64");

    await expect(
      launchBackendProcess({
        runID: 3,
        token: "token-123",
        resolveBackendLaunch: () => {
          throw failure;
        },
        spawnProcess: vi.fn(),
        processEnv: {},
        setBackendState,
        setBackendProcess,
        trackBackendProcess,
        waitForBackendPort,
        isCurrentRun: () => true,
        isAppQuitting: () => false
      })
    ).rejects.toThrow("backend binary not found for win32-x64");

    expect(setBackendState).toHaveBeenCalledTimes(1);
    expect(setBackendState).toHaveBeenCalledWith("error", {
      error: "backend binary not found for win32-x64"
    });
    expect(setBackendProcess).toHaveBeenCalledWith(undefined);
    expect(trackBackendProcess).not.toHaveBeenCalled();
    expect(waitForBackendPort).not.toHaveBeenCalled();
  });
});

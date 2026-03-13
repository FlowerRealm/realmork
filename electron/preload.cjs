const { contextBridge, ipcRenderer } = require("electron");

const BACKEND_STATE_EVENT = "realmork:backend-state";

contextBridge.exposeInMainWorld("realmork", {
  getBackendState: () => ipcRenderer.invoke("realmork:get-backend-state"),
  waitForBackend: () => ipcRenderer.invoke("realmork:wait-for-backend"),
  retryBackendStart: () => ipcRenderer.invoke("realmork:retry-backend-start"),
  subscribeBackendState: (listener) => {
    const handleChange = (_event, state) => {
      listener(state);
    };

    ipcRenderer.on(BACKEND_STATE_EVENT, handleChange);
    return () => {
      ipcRenderer.removeListener(BACKEND_STATE_EVENT, handleChange);
    };
  }
});

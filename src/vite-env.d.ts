/// <reference types="vite/client" />

type RealmorkBackendStatus = "starting" | "ready" | "error";

type RealmorkBackendState = {
  status: RealmorkBackendStatus;
  apiBaseUrl: string;
  apiToken: string;
  error: string;
};

interface Window {
  realmork: {
    getBackendState: () => Promise<RealmorkBackendState>;
    waitForBackend: () => Promise<RealmorkBackendState>;
    retryBackendStart: () => Promise<RealmorkBackendState>;
    subscribeBackendState: (listener: (state: RealmorkBackendState) => void) => () => void;
  };
}

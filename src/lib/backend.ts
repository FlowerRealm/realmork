export type BackendStatus = RealmorkBackendStatus;
export type BackendState = RealmorkBackendState;

function bridge() {
  return window.realmork;
}

export async function getBackendState(): Promise<BackendState> {
  return bridge().getBackendState();
}

export async function waitForBackend(): Promise<BackendState> {
  return bridge().waitForBackend();
}

export async function retryBackendStart(): Promise<BackendState> {
  return bridge().retryBackendStart();
}

export function subscribeBackendState(listener: (state: BackendState) => void): () => void {
  return bridge().subscribeBackendState(listener);
}

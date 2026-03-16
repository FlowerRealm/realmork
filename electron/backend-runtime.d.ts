export interface BackendStateSnapshot {
  status: string;
  apiBaseUrl: string;
  apiToken: string;
  error: string;
}

export interface LaunchBackendProcessOptions<TChild> {
  runID: number;
  token: string;
  resolveBackendLaunch: (token: string) => {
    command: string;
    args: string[];
    cwd: string;
  };
  spawnProcess: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      stdio: ["ignore", "pipe", "pipe"];
    }
  ) => TChild;
  processEnv: NodeJS.ProcessEnv;
  setBackendState: (status: string, patch?: Partial<BackendStateSnapshot>) => BackendStateSnapshot;
  setBackendProcess: (child: TChild | undefined) => void;
  trackBackendProcess: (child: TChild, runID: number) => void;
  waitForBackendPort: (child: TChild) => Promise<number>;
  isCurrentRun: (runID: number) => boolean;
  isAppQuitting: () => boolean;
}

export function launchBackendProcess<TChild>(
  options: LaunchBackendProcessOptions<TChild>
): Promise<BackendStateSnapshot>;

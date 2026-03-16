import path from "node:path";

const BACKEND_BINARY_BASENAME = "homeworkd";

export function backendBinaryName(runtimePlatform) {
  return runtimePlatform === "win32" ? `${BACKEND_BINARY_BASENAME}.exe` : BACKEND_BINARY_BASENAME;
}

export function backendArtifactDirectoryName(runtimePlatform, runtimeArch) {
  return `${runtimePlatform}-${runtimeArch}`;
}

export function backendArtifactRelativePath(runtimePlatform, runtimeArch) {
  return path.join("bin", backendArtifactDirectoryName(runtimePlatform, runtimeArch), backendBinaryName(runtimePlatform));
}

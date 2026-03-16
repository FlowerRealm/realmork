import path from "node:path";
import { backendArtifactRelativePath, backendBinaryName } from "./backend-artifacts.js";

describe("backend artifacts", () => {
  it("uses .exe for Windows runtime artifacts", () => {
    expect(backendBinaryName("win32")).toBe("homeworkd.exe");
  });

  it("uses bare binaries for non-Windows runtime artifacts", () => {
    expect(backendBinaryName("linux")).toBe("homeworkd");
    expect(backendBinaryName("darwin")).toBe("homeworkd");
  });

  it("builds packaged backend paths from runtime platform and arch", () => {
    expect(backendArtifactRelativePath("win32", "x64")).toBe(path.join("bin", "win32-x64", "homeworkd.exe"));
    expect(backendArtifactRelativePath("linux", "x64")).toBe(path.join("bin", "linux-x64", "homeworkd"));
  });
});

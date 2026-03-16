import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import mainProcessSource from "./main.js?raw";

const builderConfig = readFileSync(path.join(process.cwd(), "electron-builder.yml"), "utf8");

describe("icon wiring", () => {
  it("configures packaged Electron icons for each supported target", () => {
    expect(builderConfig).toContain("buildResources: build");
    expect(builderConfig).toContain("mac:");
    expect(builderConfig).toContain("icon: icon.png");
    expect(builderConfig).toContain("linux:");
    expect(builderConfig).toContain("icon: icons");
    expect(builderConfig).toContain("win:");
    expect(builderConfig).toContain("icon: icon.ico");
  });

  it("loads the shared runtime icon for development and packaged desktop windows", () => {
    expect(mainProcessSource).toContain('return path.join(process.cwd(), "public", "app-icon.png");');
    expect(mainProcessSource).toContain('return path.join(app.getAppPath(), "dist", "app-icon.png");');
    expect(mainProcessSource).toContain('icon: process.platform === "darwin" ? undefined : resolveWindowIconPath(),');
  });

  it("keeps the generated source and derived favicon assets in the repo", () => {
    expect(existsSync(path.join(process.cwd(), "assets/icons/realmork-app.svg"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "public/favicon.svg"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "public/favicon.ico"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "public/app-icon.png"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "build/icon.png"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "build/icon.ico"))).toBe(true);
  });
});

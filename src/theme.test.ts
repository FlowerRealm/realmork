import { readFileSync } from "node:fs";
import path from "node:path";

const themeCss = readFileSync(path.join(process.cwd(), "src/theme.css"), "utf8");

describe("theme foundation", () => {
  it("defines the shared page tokens and global font stack", () => {
    expect(themeCss).toContain("--page:");
    expect(themeCss).toContain("--surface:");
    expect(themeCss).toContain("--action:");
    expect(themeCss).toContain('--font-sans: "Realmork Sans"');
    expect(themeCss).toContain("font-family: var(--font-sans);");
    expect(themeCss).toContain("--font-weight-semibold: 600;");
    expect(themeCss).toContain('"Microsoft YaHei UI"');
    expect(themeCss).toContain("background: var(--page);");
  });

  it("keeps form controls and the loader aligned with the base theme", () => {
    expect(themeCss).toContain("button, input, textarea, select {");
    expect(themeCss).toContain("font-family: inherit;");
    expect(themeCss).toContain(".warm-loader-stack {");
    expect(themeCss).toContain("animation: spin 1.2s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;");
  });
});

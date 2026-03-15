import { readFileSync } from "node:fs";
import path from "node:path";

const themeCss = readFileSync(path.join(process.cwd(), "src/theme.css"), "utf8");

describe("theme typography", () => {
  it("defines shared font tokens for the bundled Chinese font stack", () => {
    expect(themeCss).toContain('--font-sans: "Realmork Sans"');
    expect(themeCss).toContain("font-family: var(--font-sans);");
    expect(themeCss).toContain("--font-weight-semibold: 600;");
    expect(themeCss).toContain('"Microsoft YaHei UI"');
  });
});

import fs from "node:fs";
import path from "node:path";

const bootHtml = fs.readFileSync(path.join(process.cwd(), "electron", "boot.html"), "utf8");
const mainProcessSource = fs.readFileSync(path.join(process.cwd(), "electron", "main.js"), "utf8");

describe("electron boot page", () => {
  it("uses the refreshed copy and crisp font rendering defaults", () => {
    expect(bootHtml).toContain("正在准备界面与作业数据，请稍候。");
    expect(bootHtml).not.toContain("暖色界面与作业数据正在就绪，请稍候。");
    expect(bootHtml).toContain("font-family: system-ui");
    expect(bootHtml).not.toContain("text-rendering: optimizeLegibility");
    expect(bootHtml).not.toContain("-webkit-font-smoothing: antialiased");
    expect(bootHtml).not.toContain("-moz-osx-font-smoothing: grayscale");
  });

  it("drops the old warm glass effects from the standalone loader", () => {
    expect(bootHtml).not.toContain("filter: blur(");
    expect(bootHtml).not.toContain("linear-gradient(");
    expect(bootHtml).not.toContain("radial-gradient(");
  });

  it("matches the initial window background to the cold boot page", () => {
    expect(mainProcessSource).toContain('backgroundColor: "#edf3f8"');
  });
});

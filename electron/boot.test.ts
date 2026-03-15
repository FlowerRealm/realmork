import bootHtml from "./boot.html?raw";
import mainProcessSource from "./main.js?raw";

describe("electron boot page", () => {
  it("uses the bundled Source Han Sans shell and crisp font rendering defaults", () => {
    expect(bootHtml).toContain("正在准备界面与作业数据，请稍候。");
    expect(bootHtml).not.toContain("暖色界面与作业数据正在就绪，请稍候。");
    expect(bootHtml).toContain('font-family: "Realmork Sans";');
    expect(bootHtml).toContain("../public/fonts/realmork-sans-sc-vf.woff2");
    expect(bootHtml).toContain("../dist/fonts/realmork-sans-sc-vf.woff2");
    expect(bootHtml).toContain('--font-sans: "Realmork Sans"');
    expect(bootHtml).not.toContain("text-rendering: optimizeLegibility");
    expect(bootHtml).not.toContain("-webkit-font-smoothing: antialiased");
    expect(bootHtml).not.toContain("-moz-osx-font-smoothing: grayscale");
  });

  it("drops the old warm glass effects from the standalone loader", () => {
    expect(bootHtml).not.toContain("filter: blur(");
    expect(bootHtml).not.toContain("--loader-progress-start:");
    expect(bootHtml).not.toContain("--loader-progress-mid:");
    expect(bootHtml).not.toContain("--loader-glint:");
    expect(bootHtml).not.toContain("--paper-highlight:");
    expect(bootHtml).toContain("background: var(--page);");
    expect(bootHtml).toContain("--loader-progress-fill:");
  });

  it("matches the initial window background to the cold boot page", () => {
    expect(mainProcessSource).toContain('backgroundColor: "#edf3f8"');
  });
});

import bootHtml from "./boot.html?raw";
import mainProcessSource from "./main.js?raw";

describe("electron boot page", () => {
  it("shows the current loading copy and theme palette", () => {
    expect(bootHtml).toContain("正在准备 Realmork");
    expect(bootHtml).toContain("正在准备界面与作业数据，请稍候。");
    expect(bootHtml).toContain('--font-sans: "Inter", "system-ui", "-apple-system", sans-serif;');
    expect(bootHtml).toContain("background: var(--page);");
    expect(bootHtml).toContain("font-family: var(--font-sans);");
  });

  it("keeps the standalone spinner and error-state fallback behavior", () => {
    expect(bootHtml).toContain('<div class="warm-loader-stack"></div>');
    expect(bootHtml).toContain("animation: spin 1.2s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;");
    expect(bootHtml).toContain("body.is-error .warm-loader-stack {");
    expect(bootHtml).toContain('document.body.classList.add("is-error")');
    expect(bootHtml).toContain('textContent = "启动失败"');
    expect(bootHtml).toContain('textContent = "本地服务未就绪，请稍后重试。"');
  });

  it("matches the initial window background to the cold boot page", () => {
    expect(mainProcessSource).toContain('backgroundColor: "#edf3f8"');
  });
});

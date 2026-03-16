import shellHtml from "../index.html?raw";

describe("renderer shell", () => {
  it("keeps a minimal entry document for the renderer app", () => {
    expect(shellHtml).toContain('<html lang="zh-CN">');
    expect(shellHtml).toContain("<div id=\"root\"></div>");
    expect(shellHtml).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it("defines the initial light palette and font stack before React boots", () => {
    expect(shellHtml).toContain("color-scheme: light;");
    expect(shellHtml).toContain("background: hsl(35, 10%, 97%);");
    expect(shellHtml).toContain('font-family: "Inter", "SF Pro Display", "system-ui"');
  });
});

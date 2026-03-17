import shellHtml from "../index.html?raw";

describe("renderer shell", () => {
  it("keeps a minimal entry document for the renderer app", () => {
    expect(shellHtml).toContain('<html lang="zh-CN">');
    expect(shellHtml).toContain("<div id=\"root\"></div>");
    expect(shellHtml).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it("preloads and advertises the bundled Chinese font before React boots", () => {
    expect(shellHtml).toContain('rel="preload"');
    expect(shellHtml).toContain("./fonts/realmork-sans-sc-vf.woff2");
    expect(shellHtml).toContain('--font-sans: "Realmork Sans"');
    expect(shellHtml).not.toContain('"IBM Plex Sans"');
    expect(shellHtml).toContain("background: #edf3f8;");
  });

  it("publishes the shared favicon assets from the generated icon set", () => {
    expect(shellHtml).toContain('type="image/svg+xml" href="./favicon.svg"');
    expect(shellHtml).toContain('sizes="32x32" href="./favicon-32.png"');
    expect(shellHtml).toContain('href="./favicon.ico"');
    expect(shellHtml).toContain('href="./apple-touch-icon.png"');
  });
});

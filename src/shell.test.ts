import shellHtml from "../index.html?raw";

describe("renderer shell", () => {
  it("preloads and advertises the bundled Chinese font before React boots", () => {
    expect(shellHtml).toContain('rel="preload"');
    expect(shellHtml).toContain("./fonts/realmork-sans-sc-vf.woff2");
    expect(shellHtml).toContain('--font-sans: "Realmork Sans"');
    expect(shellHtml).not.toContain('"IBM Plex Sans"');
    expect(shellHtml).toContain("background: #edf3f8;");
  });
});

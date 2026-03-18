import viteConfigSource from "../vite.config.ts?raw";

describe("vite production config", () => {
  it("uses a relative asset base so the Electron renderer works from file URLs", () => {
    expect(viteConfigSource).toContain('base: "./"');
  });
});

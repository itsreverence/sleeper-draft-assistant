import { describe, expect, it } from "vitest";

import { resolvePackagedApiPort } from "./api-config";

describe("packaged API configuration", () => {
  it("accepts valid custom ports passed by Electron", () => {
    expect(resolvePackagedApiPort("18787")).toBe(18787);
  });

  it("falls back for absent or invalid ports", () => {
    expect(resolvePackagedApiPort(null)).toBe(8787);
    expect(resolvePackagedApiPort("0")).toBe(8787);
    expect(resolvePackagedApiPort("65536")).toBe(8787);
    expect(resolvePackagedApiPort("not-a-port")).toBe(8787);
  });
});

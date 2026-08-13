import { describe, expect, it } from "vitest";

import { resolvePackagedApiConfiguration, resolvePackagedApiPort } from "./api-config";
import { createFakeLocalStorage } from "./testing/fake-local-storage";

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

  it("retains launch credentials for a packaged renderer reload", () => {
    const storage = createFakeLocalStorage();
    const launch = resolvePackagedApiConfiguration(
      new URLSearchParams("apiToken=launch-token&apiPort=18787"),
      storage,
    );
    const reload = resolvePackagedApiConfiguration(new URLSearchParams(), storage);

    expect(launch).toEqual({ apiToken: "launch-token", apiPort: 18787 });
    expect(reload).toEqual(launch);
  });

  it("does not accept missing or malformed stored credentials", () => {
    const storage = createFakeLocalStorage({
      "sleeper-draft-assistant:packaged-api": "not-json",
    });

    expect(resolvePackagedApiConfiguration(new URLSearchParams(), storage)).toEqual({
      apiToken: null,
      apiPort: 8787,
    });
  });

  it("continues from the launch query when session storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(resolvePackagedApiConfiguration(
      new URLSearchParams("apiToken=launch-token&apiPort=18787"),
      unavailableStorage,
    )).toEqual({ apiToken: "launch-token", apiPort: 18787 });
  });
});

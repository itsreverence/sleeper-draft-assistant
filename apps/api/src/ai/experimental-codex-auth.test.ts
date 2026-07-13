import { lstatSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ExperimentalCodexTokenStore } from "./experimental-codex-auth";

const describePosix = process.platform === "win32" ? describe.skip : describe;

describePosix("experimental token storage", () => {
  it("stores token files with owner-only permissions and removes them on logout", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-token-store-")), "tokens.json");
    const store = new ExperimentalCodexTokenStore(filePath);
    const originalUmask = process.umask(0o000);

    try {
      store.set({ accessToken: "test-access", refreshToken: "test-refresh" });
    } finally {
      process.umask(originalUmask);
    }

    expect(lstatSync(filePath).mode & 0o777).toBe(0o600);
    expect(store.get()).toEqual({ accessToken: "test-access", refreshToken: "test-refresh" });
    store.clear();
    expect(store.get()).toBeNull();
  });
});

import { lstatSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ensurePrivateDirectory, readPrivateTextFile, writePrivateFile } from "./secure-file";

const describePosix = process.platform === "win32" ? describe.skip : describe;

describePosix("private local artifacts", () => {
  it("creates owner-only directories and atomically replaces owner-only files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sleeper-private-file-"));
    const directory = path.join(root, "data");
    const filePath = path.join(directory, "settings.json");
    const originalUmask = process.umask(0o000);

    try {
      ensurePrivateDirectory(directory);
      writePrivateFile(filePath, "first");
      writePrivateFile(filePath, "second");
    } finally {
      process.umask(originalUmask);
    }

    expect(lstatSync(directory).mode & 0o777).toBe(0o700);
    expect(lstatSync(filePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(filePath, "utf8")).toBe("second");
  });

  it("rejects existing and dangling symbolic-link paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sleeper-private-link-"));
    const realDirectory = path.join(root, "real");
    ensurePrivateDirectory(realDirectory);

    const linkedDirectory = path.join(root, "linked");
    symlinkSync(realDirectory, linkedDirectory, "dir");
    expect(() => writePrivateFile(path.join(linkedDirectory, "token.json"), "secret")).toThrow(/symbolic-link/);

    const danglingFile = path.join(realDirectory, "dangling.json");
    symlinkSync(path.join(root, "missing.json"), danglingFile);
    expect(() => writePrivateFile(danglingFile, "secret")).toThrow(/symbolic-link/);
    expect(() => readPrivateTextFile(danglingFile)).toThrow(/symbolic-link/);
  });
});

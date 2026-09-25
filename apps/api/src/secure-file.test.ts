import { lstatSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommittedFileWriteError, ensurePrivateDirectory, readPrivateTextFile, writePrivateFile } from "./secure-file";

const faults = vi.hoisted(() => ({ failDirectorySync: false, failFileSync: false }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, fsyncSync(descriptor: number) {
    const directory = actual.fstatSync(descriptor).isDirectory();
    if ((directory && faults.failDirectorySync) || (!directory && faults.failFileSync)) throw new Error("simulated sync failure");
    actual.fsyncSync(descriptor);
  } };
});
afterEach(() => { faults.failDirectorySync = false; faults.failFileSync = false; });

const describePosix = process.platform === "win32" ? describe.skip : describe;

describePosix("private local artifacts", () => {
  it("distinguishes failure before replacement from unconfirmed durability after replacement", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "sda-private-commit-"));
    const file = path.join(directory, "settings.json");
    writePrivateFile(file, "before");
    faults.failFileSync = true;
    expect(() => writePrivateFile(file, "not committed")).toThrow("simulated sync failure");
    expect(readFileSync(file, "utf8")).toBe("before");
    faults.failFileSync = false;
    faults.failDirectorySync = true;
    expect(() => writePrivateFile(file, "committed")).toThrow(CommittedFileWriteError);
    expect(readFileSync(file, "utf8")).toBe("committed");
    expect(lstatSync(file).mode & 0o777).toBe(0o600);
  });
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

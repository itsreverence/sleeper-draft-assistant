import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const mainUrl = new URL("./main.cjs", import.meta.url);
const requireMain = createRequire(mainUrl);

function launch({ occupiedPort = false, rendererFailure = false } = {}) {
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const app = new EventEmitter();
  Object.assign(app, {
    isPackaged: true,
    setName: vi.fn(),
    setPath: vi.fn(),
    getPath: () => "/synthetic-profile",
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit: vi.fn(() => finish()),
  });
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 1 })) };
  const child = new EventEmitter();
  Object.assign(child, { exitCode: null, signalCode: null, kill: vi.fn() });
  const spawn = vi.fn(() => {
    queueMicrotask(() => child.emit("error", new Error("ENOENT private executable path")));
    return child;
  });
  const windows = [];
  class BrowserWindow {
    constructor() {
      windows.push(this);
      this.webContents = { setWindowOpenHandler() {}, on() {} };
      this.show = vi.fn();
      this.destroy = vi.fn(() => app.emit("window-all-closed"));
    }
    isDestroyed() { return false; }
    async loadFile() { throw new Error("private file failed to load"); }
    static getAllWindows() { return windows; }
  }
  const isAllowedExternalUrl = vm.runInNewContext(`${readFileSync(mainUrl, "utf8")}\n;isAllowedExternalUrl;`, {
    require(name) {
      if (name === "electron") return { app, dialog, BrowserWindow, shell: {} };
      if (name === "node:child_process") return { spawn };
      if (name === "node:net") return {
        createConnection() {
          const socket = new EventEmitter();
          socket.destroy = vi.fn();
          socket.setTimeout = vi.fn();
          queueMicrotask(() => socket.emit(occupiedPort || rendererFailure ? "connect" : "error"));
          return socket;
        },
      };
      return requireMain(name);
    },
    process: { env: {}, platform: process.platform, execPath: process.execPath, resourcesPath: "/package" },
    __dirname: new URL(".", mainUrl).pathname,
    fetch: rendererFailure
      ? async () => ({ ok: true, json: async () => ({ ok: true, service: "sleeper-ai-api", capabilities: { decisionLog: true, draftLeagueId: true } }) })
      : async () => { throw new Error("unavailable"); },
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    URL,
  });
  return { completed, app, dialog, spawn, windows, isAllowedExternalUrl };
}

describe("desktop main startup failures", () => {
  it("accepts the official NFL AMP host without allowing arbitrary subdomains or unsafe URLs", async () => {
    const launched = launch({ occupiedPort: true });
    await launched.completed;
    expect(launched.isAllowedExternalUrl("https://amp.nfl.com/news/report")).toBe(true);
    for (const url of ["https://amp.nfl.com.evil.test/news", "https://unknown.nfl.com/news", "http://amp.nfl.com/news", "https://user:secret@amp.nfl.com/news", "https://amp.nfl.com:8080/news"]) {
      expect(launched.isAllowedExternalUrl(url)).toBe(false);
    }
  });
  it("reports an incompatible occupied port before opening a window", async () => {
    const launched = launch({ occupiedPort: true });
    await launched.completed;
    expect(launched.windows).toHaveLength(0);
    expect(launched.spawn).not.toHaveBeenCalled();
    expect(launched.dialog.showMessageBox.mock.calls[0][0].detail).toContain("Another service");
    expect(launched.app.quit).toHaveBeenCalledOnce();
  });

  it("handles API spawn errors and shows recovery without an unhandled error event", async () => {
    const launched = launch();
    await launched.completed;
    expect(launched.spawn).toHaveBeenCalledOnce();
    expect(launched.dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(JSON.stringify(launched.dialog.showMessageBox.mock.calls)).not.toContain("private executable");
    expect(launched.windows).toHaveLength(0);
  });

  it("destroys a failed renderer without quitting before the recovery dialog", async () => {
    const launched = launch({ rendererFailure: true });
    await launched.completed;
    expect(launched.windows[0].destroy).toHaveBeenCalledOnce();
    expect(launched.windows[0].show).not.toHaveBeenCalled();
    expect(launched.dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(launched.app.quit).toHaveBeenCalledOnce();
  });
});

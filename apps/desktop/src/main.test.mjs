import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { NEWS_SOURCE_HOSTS } from "../../../packages/shared/src/index.ts";

const mainUrl = new URL("./main.cjs", import.meta.url);
const requireMain = createRequire(mainUrl);

function launch({ occupiedPort = false, rendererFailure = false, rendererReady = false } = {}) {
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
  const shell = { openExternal: vi.fn() };
  class BrowserWindow {
    constructor(options) {
      windows.push(this);
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = (handler) => { this.windowOpenHandler = handler; };
      this.show = vi.fn(() => finish());
      this.destroy = vi.fn(() => app.emit("window-all-closed"));
    }
    isDestroyed() { return false; }
    async loadFile() {
      if (rendererFailure || !rendererReady) throw new Error("private file failed to load");
    }
    static getAllWindows() { return windows; }
  }
  const isAllowedExternalUrl = vm.runInNewContext(`${readFileSync(mainUrl, "utf8")}\n;isAllowedExternalUrl;`, {
    require(name) {
      if (name === "electron") return { app, dialog, BrowserWindow, shell };
      if (name === "node:child_process") return { spawn };
      if (name === "node:net") return {
        createConnection() {
          const socket = new EventEmitter();
          socket.destroy = vi.fn();
          socket.setTimeout = vi.fn();
          queueMicrotask(() => socket.emit(occupiedPort || rendererFailure || rendererReady ? "connect" : "error"));
          return socket;
        },
      };
      return requireMain(name);
    },
    process: { env: {}, platform: process.platform, execPath: process.execPath, resourcesPath: "/package" },
    __dirname: new URL(".", mainUrl).pathname,
    fetch: rendererFailure || rendererReady
      ? async () => ({ ok: true, json: async () => ({ ok: true, service: "sleeper-ai-api", capabilities: { decisionLog: true, draftLeagueId: true } }) })
      : async () => { throw new Error("unavailable"); },
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    URL,
  });
  return { completed, app, dialog, spawn, windows, shell, isAllowedExternalUrl };
}

describe("desktop window security", () => {
  it("isolates the renderer, denies popup windows, and prevents external navigation", async () => {
    const launched = launch({ rendererReady: true });
    await launched.completed;
    expect(launched.windows).toHaveLength(1);
    const [window] = launched.windows;
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.options.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });

    expect(window.windowOpenHandler({ url: "https://arbitrary.example/path" })).toEqual({ action: "deny" });
    expect(launched.shell.openExternal).not.toHaveBeenCalled();
    const allowedUrl = "https://www.fantasypros.com/nfl/rankings/";
    expect(window.windowOpenHandler({ url: allowedUrl })).toEqual({ action: "deny" });
    expect(launched.shell.openExternal).toHaveBeenCalledExactlyOnceWith(allowedUrl);

    const event = { preventDefault: vi.fn() };
    window.webContents.emit("will-navigate", event, "https://arbitrary.example/path");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(launched.shell.openExternal).toHaveBeenCalledExactlyOnceWith(allowedUrl);
  });
});

describe("desktop main startup failures", () => {
  it("accepts the official NFL AMP host without allowing arbitrary subdomains or unsafe URLs", async () => {
    const launched = launch({ occupiedPort: true });
    await launched.completed;
    expect(launched.isAllowedExternalUrl("https://amp.nfl.com/news/report")).toBe(true);
    for (const url of ["https://amp.nfl.com.evil.test/news", "https://unknown.nfl.com/news", "http://amp.nfl.com/news", "https://user:secret@amp.nfl.com/news", "https://amp.nfl.com:8080/news"]) {
      expect(launched.isAllowedExternalUrl(url)).toBe(false);
    }
  });
  it("opens every news host that citation validation accepts", async () => {
    const launched = launch({ occupiedPort: true });
    await launched.completed;
    for (const host of NEWS_SOURCE_HOSTS) expect(launched.isAllowedExternalUrl(`https://${host}/news/report`)).toBe(true);
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

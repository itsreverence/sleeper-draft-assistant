import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEWS_SOURCE_HOSTS } from "../../../packages/shared/src/index.ts";

const mainUrl = new URL("./main.cjs", import.meta.url);
const requireMain = createRequire(mainUrl);

function launch({ occupiedPort = false, rendererFailure = false, rendererReady = false, executeJavaScript = async () => true, markerFailure = false, env = {} } = {}) {
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const app = new EventEmitter();
  Object.assign(app, {
    isPackaged: true,
    disableHardwareAcceleration: vi.fn(),
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
  const writeFileSync = vi.fn(() => {
    if (markerFailure) throw new Error("private marker path is unwritable");
  });
  const logger = { error: vi.fn() };
  class BrowserWindow {
    constructor(options) {
      windows.push(this);
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.executeJavaScript = vi.fn(executeJavaScript);
      this.securityAtLoad = [];
      this.webContents.setWindowOpenHandler = (handler) => { this.windowOpenHandler = handler; };
      this.show = vi.fn(() => finish());
      this.destroy = vi.fn(() => app.emit("window-all-closed"));
    }
    isDestroyed() { return false; }
    async loadFile() {
      this.securityAtLoad.push({
        windowOpenHandler: typeof this.windowOpenHandler === "function",
        navigationListener: this.webContents.listenerCount("will-navigate") > 0,
      });
      if (rendererFailure || !rendererReady) {
        this.webContents.emit("did-fail-load", {}, -6, "ERR_FILE_NOT_FOUND");
        throw new Error("private file failed to load");
      }
      this.webContents.emit("did-finish-load");
    }
    static getAllWindows() { return windows; }
  }
  const isAllowedExternalUrl = vm.runInNewContext(`${readFileSync(mainUrl, "utf8")}\n;isAllowedExternalUrl;`, {
    require(name) {
      if (name === "electron") return { app, dialog, BrowserWindow, shell };
      if (name === "node:child_process") return { spawn };
      if (name === "node:fs") return { writeFileSync };
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
    process: { env, platform: process.platform, execPath: process.execPath, resourcesPath: "/package" },
    __dirname: new URL(".", mainUrl).pathname,
    fetch: rendererFailure || rendererReady
      ? async () => ({ ok: true, json: async () => ({ ok: true, service: "sleeper-ai-api", capabilities: { decisionLog: true, draftLeagueId: true } }) })
      : async () => { throw new Error("unavailable"); },
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    console: logger,
    URL,
  });
  return { completed, app, dialog, spawn, windows, shell, writeFileSync, logger, isAllowedExternalUrl };
}

describe("desktop window security", () => {
  it("isolates the renderer, denies popup windows, and prevents external navigation", async () => {
    const launched = launch({ rendererReady: true });
    await launched.completed;
    expect(launched.windows).toHaveLength(1);
    const [window] = launched.windows;
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.securityAtLoad[0]).toEqual({ windowOpenHandler: true, navigationListener: true });
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

describe("desktop package smoke readiness", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for the renderer app to mount after the packaged page loads", async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const launched = launch({ rendererReady: true, executeJavaScript: probe, env: { SLEEPER_AI_PACKAGE_SMOKE: "1" } });
    await launched.completed;
    expect(launched.writeFileSync).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenCalledWith("document.querySelector('#app')?.childElementCount > 0");
    expect(launched.writeFileSync).toHaveBeenCalledExactlyOnceWith(
      join("/synthetic-profile", "renderer-ready"), "ready\n",
    );
  });

  it.each([undefined, "0"])("does not write a readiness marker when smoke mode is %s", async (smokeMode) => {
    vi.useFakeTimers();
    const launched = launch({ rendererReady: true, env: { SLEEPER_AI_PACKAGE_SMOKE: smokeMode } });
    await launched.completed;
    await vi.runAllTimersAsync();
    expect(launched.writeFileSync).not.toHaveBeenCalled();
    expect(launched.windows[0].webContents.executeJavaScript).not.toHaveBeenCalled();
  });

  it("does not write a readiness marker when the renderer fails to load", async () => {
    const launched = launch({ rendererFailure: true, env: { SLEEPER_AI_PACKAGE_SMOKE: "1" } });
    await launched.completed;
    // Electron can finish loading an error page after rejecting loadFile.
    launched.windows[0].webContents.emit("did-finish-load");
    expect(launched.windows[0].destroy).toHaveBeenCalledOnce();
    expect(launched.writeFileSync).not.toHaveBeenCalled();
  });

  it("times out without a marker when the page loads but the app stays empty", async () => {
    vi.useFakeTimers();
    const launched = launch({ rendererReady: true, executeJavaScript: async () => false, env: { SLEEPER_AI_PACKAGE_SMOKE: "1" } });
    await launched.completed;
    await vi.runAllTimersAsync();
    expect(launched.writeFileSync).not.toHaveBeenCalled();
    expect(launched.windows[0].webContents.executeJavaScript).toHaveBeenCalled();
    expect(launched.logger.error).toHaveBeenCalledWith("Packaged renderer did not mount before the smoke timeout.");
    expect(launched.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it.each(["probe", "marker"])("logs a %s failure without a main-process exception", async (failure) => {
    vi.useFakeTimers();
    const launched = launch({
      rendererReady: true,
      executeJavaScript: async () => {
        if (failure === "probe") throw new Error("private renderer error");
        return true;
      },
      markerFailure: failure === "marker",
      env: { SLEEPER_AI_PACKAGE_SMOKE: "1" },
    });
    await launched.completed;
    await vi.runAllTimersAsync();
    expect(launched.logger.error).toHaveBeenCalledExactlyOnceWith("Could not verify packaged renderer readiness.");
    expect(launched.dialog.showMessageBox).not.toHaveBeenCalled();
    expect(launched.app.quit).not.toHaveBeenCalled();
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
    for (const host of NEWS_SOURCE_HOSTS) {
      expect(launched.isAllowedExternalUrl(`https://${host}/news/report`)).toBe(true);
      for (const url of [`https://${host}.evil.test/news`, `https://arbitrary.${host}/news`, `http://${host}/news`, `https://user:secret@${host}/news`, `https://${host}:8080/news`]) {
        expect(launched.isAllowedExternalUrl(url)).toBe(false);
      }
    }
  });
  it.each(["sports.nbcsports.com", "profootballtalk.nbcsports.com", "other.nbcsports.com"])("rejects unapproved NBC subdomain %s", async (host) => {
    const launched = launch({ occupiedPort: true });
    await launched.completed;
    expect(launched.isAllowedExternalUrl(`https://${host}/news/report`)).toBe(false);
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

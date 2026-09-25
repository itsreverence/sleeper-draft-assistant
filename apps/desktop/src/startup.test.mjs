import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import startup from "./startup.cjs";

const { StartupError, startWithRecovery, stopChild } = startup;

describe("desktop startup recovery", () => {
  it("cleans up a failed attempt before retrying and keeps raw errors out of the dialog", async () => {
    const events = [];
    const start = vi.fn()
      .mockImplementationOnce(async () => {
        events.push("failed start");
        throw new Error("Cannot open /home/private-user/app.sqlite with Bearer private-token");
      })
      .mockImplementationOnce(async () => { events.push("ready"); });
    const showMessageBox = vi.fn(async () => {
      events.push("dialog");
      return { response: 0 };
    });
    const quit = vi.fn();
    await startWithRecovery({
      start,
      cleanup: async () => { events.push("cleanup"); },
      showMessageBox,
      quit,
    });
    expect(events).toEqual(["failed start", "cleanup", "dialog", "ready"]);
    expect(JSON.stringify(showMessageBox.mock.calls)).not.toMatch(/private-user|private-token|app\.sqlite/);
    expect(quit).not.toHaveBeenCalled();
  });

  it("offers safe port-conflict guidance and exits without retrying", async () => {
    const start = vi.fn(async () => { throw new StartupError("port"); });
    const cleanup = vi.fn();
    const showMessageBox = vi.fn(async () => ({ response: 1 }));
    const quit = vi.fn();
    await startWithRecovery({ start, cleanup, showMessageBox, quit });
    expect(showMessageBox.mock.calls[0][0]).toMatchObject({
      buttons: ["Retry", "Exit"],
      cancelId: 1,
      detail: expect.stringContaining("Another service"),
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledOnce();
  });

  it("cleans up a real startup child before completing", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    await stopChild(child);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });

  it("handles a process that could not be spawned without waiting for an exit", async () => {
    const child = spawn("sleeper-audit-nonexistent-executable", [], { stdio: "ignore" });
    await new Promise((resolve) => child.once("error", resolve));
    await stopChild(child);
    expect(child.pid).toBeUndefined();
  });
});

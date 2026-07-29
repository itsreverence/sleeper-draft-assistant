import { describe, expect, it, vi } from "vitest";

import { resolveCodexLaunch } from "./codex-app-server-provider";

describe("Codex app-server executable resolution", () => {
  it("uses codex.exe for bare Windows launcher names", () => {
    const launch = {
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"],
    };
    const findLaunch = vi.fn(() => launch);

    expect(resolveCodexLaunch("codex", "win32", findLaunch)).toEqual(launch);
    expect(resolveCodexLaunch("codex.cmd", "win32", findLaunch)).toEqual(launch);
    expect(findLaunch).toHaveBeenCalledTimes(2);
  });

  it("keeps explicit executable paths and non-Windows commands unchanged", () => {
    expect(resolveCodexLaunch("C:\\Codex\\codex.exe", "win32")).toEqual({
      command: "C:\\Codex\\codex.exe",
      args: [],
    });
    expect(resolveCodexLaunch("/usr/local/bin/codex", "linux")).toEqual({
      command: "/usr/local/bin/codex",
      args: [],
    });
  });
});

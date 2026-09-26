import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

// Owned by this invocation only; never reuse the developer's database or token.
const dataDirectory = mkdtempSync(join(tmpdir(), "sda-browser-"));
const token = randomBytes(32).toString("base64url");
const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    SLEEPER_AI_DATA_DIR: dataDirectory,
    SLEEPER_AI_API_TOKEN: token,
    VITE_SLEEPER_AI_API_TOKEN: token,
    SLEEPER_AI_PROVIDER: "noop",
    PORT: "18887",
    SDA_BROWSER_TEST: "1",
  },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("close", (code) => {
  rmSync(dataDirectory, { recursive: true, force: true });
  process.exitCode = code ?? 1;
});
// Playwright owns its server process groups and shuts them down before exiting.
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

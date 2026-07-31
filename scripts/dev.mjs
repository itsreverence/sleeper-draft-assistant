import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = createChildEnv();

const processes = [
  {
    name: "api",
    args: ["run", "dev", "-w", "@sleeper-draft-assistant/api"],
  },
  {
    name: "web",
    args: ["run", "dev", "-w", "@sleeper-draft-assistant/web"],
  },
].map(({ name, args }) => {
  const child = spawn(npm, args, {
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      const exitCode = code ?? 1;
      console.error(`[${name}] exited${signal ? ` from ${signal}` : ` with code ${exitCode}`}`);
      shutdown(exitCode);
    }
  });

  return child;
});

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of processes) {
    if (!child.pid || child.exitCode !== null) {
      continue;
    }

    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

function createChildEnv() {
  const apiToken = process.env.SLEEPER_AI_API_TOKEN?.trim() || randomBytes(32).toString("base64url");
  const env = {
    ...process.env,
    FORCE_COLOR: "1",
    SLEEPER_AI_API_TOKEN: apiToken,
    VITE_SLEEPER_AI_API_TOKEN: apiToken,
  };

  if (process.platform !== "win32") {
    return env;
  }

  const pathKeys = Object.keys(env).filter((key) => key.toLowerCase() === "path");
  const canonicalPathKey = pathKeys.find((key) => key === "Path") ?? pathKeys[0];

  for (const key of pathKeys) {
    if (key !== canonicalPathKey) {
      delete env[key];
    }
  }

  return env;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));


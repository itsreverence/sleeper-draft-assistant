import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopDist = path.join(repoRoot, "apps", "desktop", "dist");
const desktopWebDist = path.join(desktopDist, "web");
const webDist = path.join(repoRoot, "apps", "web", "dist");
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("npm_execpath is required to build desktop assets.");
}

rmSync(desktopDist, { recursive: true, force: true });
mkdirSync(desktopDist, { recursive: true });

execFileSync(process.execPath, [npmCli, "run", "build", "-w", "@sleeper-draft-assistant/web"], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

await build({
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  entryPoints: [path.join(repoRoot, "apps", "api", "src", "index.ts")],
  outfile: path.join(desktopDist, "api-server.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  logLevel: "info",
});

cpSync(webDist, desktopWebDist, { recursive: true });

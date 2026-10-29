import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

import { packagesFromInputs, generateNotices } from "./third-party-notices.mjs";

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

const api = await build({
  absWorkingDir: repoRoot,
  metafile: true,
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

const provenance = path.join(repoRoot, "build", "third-party");
mkdirSync(provenance, { recursive: true });
const apiInputs = Object.values(api.metafile.outputs).flatMap((output) =>
  Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([name]) => name));
const webInputs = JSON.parse(readFileSync(path.join(provenance, "web-inputs.json"), "utf8"));
const surfaces = {
  "API bundle": packagesFromInputs(apiInputs, repoRoot),
  "renderer and font assets": packagesFromInputs(webInputs, repoRoot),
};
writeFileSync(path.join(provenance, "api-metafile.json"), JSON.stringify(api.metafile, null, 2) + "\n");
writeFileSync(path.join(provenance, "surfaces.json"), JSON.stringify(surfaces, null, 2) + "\n");
writeFileSync(path.join(desktopDist, "THIRD_PARTY_NOTICES.txt"), generateNotices(surfaces, repoRoot));

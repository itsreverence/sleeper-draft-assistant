import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve("scripts/candidate-artifacts.mjs");
mkdirSync(".tmp", { recursive: true });

function candidate(t, release = false) {
  const root = mkdtempSync(resolve(".tmp/candidate-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3-beta.4" }));
  const output = join(root, "apps/desktop/out-builder");
  mkdirSync(output, { recursive: true });
  const names = ["Sleeper Draft Assistant Setup 1.2.3-beta.4.exe", "Sleeper Draft Assistant 1.2.3-beta.4.exe"];
  if (release) names.push("Sleeper Draft Assistant-1.2.3-beta.4-win.zip");
  for (const name of names) writeFileSync(join(output, name), name);
  const bundle = join(root, "build/windows-candidate");
  const files = join(bundle, "files");
  const run = (command) => spawnSync(process.execPath, [script, command, ...(release ? ["--release"] : [])], {
    cwd: root, encoding: "utf8",
  });
  return { output, names, bundle, files, run };
}

test("CI stages only the exact executables and checksums before smoke can change the build", (t) => {
  const { output, names, files, run } = candidate(t);
  assert.equal(run("record").status, 0);
  assert.deepEqual(readdirSync(files).sort(), [...names, "SHA256SUMS.txt"].sort());
  appendFileSync(join(output, names[0]), "smoke tampering");
  assert.equal(run("verify").status, 0);
  for (const name of names) {
    const hash = createHash("sha256").update(readFileSync(join(files, name))).digest("hex");
    assert.ok(readFileSync(join(files, "SHA256SUMS.txt"), "ascii").includes(`${hash}  ${name}\n`));
  }
});

test("record rejects every unexpected executable, including names outside the product prefix", (t) => {
  const { output, run } = candidate(t);
  writeFileSync(join(output, "extra.exe"), "unverified");
  const result = run("record");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected candidate artifact set/);
});

test("record rejects a missing release ZIP", (t) => {
  const { output, names, run } = candidate(t, true);
  rmSync(join(output, names[2]));
  assert.notEqual(run("record").status, 0);
});

test("release checksums use verified bytes and dotted GitHub download names", (t) => {
  const { names, files, run } = candidate(t, true);
  assert.equal(run("record").status, 0);
  assert.equal(run("verify").status, 0);
  const sums = readFileSync(join(files, "SHA256SUMS.txt"), "ascii");
  assert.equal(sums.trim().split("\n").length, 3);
  for (const name of names) {
    const hash = createHash("sha256").update(readFileSync(join(files, name))).digest("hex");
    assert.ok(sums.includes(`${hash}  ${name.replaceAll(" ", ".")}\n`));
  }
});

test("publish verification rejects artifact tampering", (t) => {
  const { names, files, run } = candidate(t, true);
  assert.equal(run("record").status, 0);
  appendFileSync(join(files, names[0]), "tampered");
  const result = run("verify");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Candidate artifact integrity failed/);
  assert.ok(!readdirSync(files).includes("SHA256SUMS.txt"));
});

test("publish verification rejects a changed manifest and an added executable", (t) => {
  const { bundle, files, run } = candidate(t, true);
  assert.equal(run("record").status, 0);
  const path = join(bundle, "candidate-hashes.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.artifacts[0].sha256 = "0".repeat(64);
  writeFileSync(path, JSON.stringify(manifest));
  assert.notEqual(run("verify").status, 0);
  writeFileSync(join(files, "extra.EXE"), "unverified");
  assert.match(run("verify").stderr, /Unexpected candidate artifact set/);
});

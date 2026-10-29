import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { verifyPackagedNotices, generateNotices, packagesFromInputs } from "./third-party-notices.mjs";

function fixture(t, license = "MIT") {
  const root = mkdtempSync(path.join(os.tmpdir(), "sda-notices-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = "node_modules/example";
  mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, directory, "package.json"), JSON.stringify({ name: "example", version: "1.0.0", license }));
  return { root, directory, surfaces: { API: [directory] } };
}

test("notices are sorted, deterministic, include complete license and Apache NOTICE text", (t) => {
  const { root, directory, surfaces } = fixture(t, "Apache-2.0");
  writeFileSync(path.join(root, directory, "LICENSE"), "Full license\r\nCopyright example\r\n");
  writeFileSync(path.join(root, directory, "NOTICE.txt"), "Upstream attribution\n");
  const text = generateNotices(surfaces, root);
  assert.match(text, /License: Apache-2.0/);
  assert.ok(text.includes("Full license\nCopyright example\n"));
  assert.ok(text.includes("Upstream attribution\n"));
  assert.ok(!text.includes(root));
  assert.equal(text, generateNotices(surfaces, root));
});

test("missing and empty license files fail even if NOTICE exists", (t) => {
  const { root, directory, surfaces } = fixture(t);
  writeFileSync(path.join(root, directory, "NOTICE"), "Attribution only");
  assert.throws(() => generateNotices(surfaces, root), /example@1.0.0 has no nonempty LICENSE/);
  writeFileSync(path.join(root, directory, "LICENSE"), " \n");
  assert.throws(() => generateNotices(surfaces, root), /no nonempty LICENSE/);
});

test("unapproved licenses and expressions require review", (t) => {
  for (const license of ["GPL-3.0", "(MIT OR GPL-3.0)", undefined]) {
    const { root, surfaces } = fixture(t, license ?? null);
    assert.throws(() => generateNotices(surfaces, root), /unapproved license/);
  }
});

test("bundle inputs resolve scoped, nested-version and nested-manifest packages without tooling", (t) => {
  const { root, directory } = fixture(t);
  const scoped = "node_modules/@scope/other";
  const nested = `${directory}/node_modules/example`;
  for (const location of [scoped, nested]) {
    mkdirSync(path.join(root, location, "src"), { recursive: true });
    writeFileSync(path.join(root, location, "package.json"), JSON.stringify({ name: location, version: "2.0.0" }));
    writeFileSync(path.join(root, location, "src/package.json"), '{"type":"module"}');
  }
  assert.deepEqual(packagesFromInputs([
    `${directory}/index.js`, `${directory}/index.js`, `${scoped}/src/index.js?commonjs`,
    `${nested}/index.js`, "apps/api/src/index.ts",
  ], root), [scoped, directory, nested].sort());
});

test("packaging guard rejects absent or truncated notices", (t) => {
  const { root, directory, surfaces } = fixture(t);
  writeFileSync(path.join(root, directory, "LICENSE"), "Full MIT license fixture");
  const expected = generateNotices(surfaces, root);
  const resources = path.join(root, "resources");
  mkdirSync(resources);
  assert.throws(() => verifyPackagedNotices(resources, expected), /ENOENT/);
  writeFileSync(path.join(resources, "THIRD_PARTY_NOTICES.txt"), "incomplete");
  assert.throws(() => verifyPackagedNotices(resources, expected), /does not cover/);
  writeFileSync(path.join(resources, "THIRD_PARTY_NOTICES.txt"), expected);
  verifyPackagedNotices(resources, expected);
});

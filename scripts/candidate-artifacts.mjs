import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [command, ...options] = process.argv.slice(2);
if (!["record", "verify"].includes(command) || options.some((option) => option !== "--release")) {
  throw new Error("Usage: node scripts/candidate-artifacts.mjs <record|verify> [--release]");
}
const release = options.includes("--release");
if (command === "verify" && !release) {
  throw new Error("verify requires --release");
}
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const names = [
  `Sleeper Draft Assistant Setup ${version}.exe`,
  `Sleeper Draft Assistant ${version}.exe`,
  ...(release ? [`Sleeper Draft Assistant-${version}-win.zip`] : []),
].sort();
const bundle = "build/windows-candidate";
const files = join(bundle, "files");
const source = command === "record" ? "apps/desktop/out-builder" : files;
const actualNames = readdirSync(source).filter((name) => /\.(exe|zip)$/i.test(name)).sort();
if (JSON.stringify(actualNames) !== JSON.stringify(names)) {
  throw new Error(`Unexpected candidate artifact set. Expected ${JSON.stringify(names)}, found ${JSON.stringify(actualNames)}.`);
}
const artifacts = names.map((name) => ({
  name,
  sha256: createHash("sha256").update(readFileSync(join(source, name))).digest("hex"),
}));
const manifestPath = join(bundle, "candidate-hashes.json");
if (command === "record") {
  mkdirSync(bundle, { recursive: true });
  mkdirSync(files);
  for (const { name } of artifacts) copyFileSync(join(source, name), join(files, name));
  writeFileSync(manifestPath, `${JSON.stringify({ version, artifacts }, null, 2)}\n`);
  console.log("Recorded and staged the exact candidate artifact set before running any smoke binary.");
} else {
  const expected = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (expected.version !== version || JSON.stringify(expected.artifacts) !== JSON.stringify(artifacts)) {
    throw new Error("Candidate artifact integrity failed against the build hash manifest.");
  }
  console.log("Candidate artifact integrity verified against the build hash manifest.");
}
if (!release || command === "verify") {
  const checksums = artifacts.map(({ name, sha256 }) => `${sha256}  ${release ? name.replaceAll(" ", ".") : name}`);
  writeFileSync(join(files, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`, "ascii");
}

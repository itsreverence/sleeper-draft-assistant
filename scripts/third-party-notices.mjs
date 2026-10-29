import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Expressions deliberately require review rather than silently choosing one branch.
const allowedLicenses = new Set([
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "OFL-1.1",
  "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Zlib", "Unlicense",
]);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function packagesFromInputs(inputs, root) {
  const packages = new Set();
  for (const input of inputs) {
    const clean = input.replace(/\?.*$/, "").replaceAll("\\", "/");
    if (!clean.includes("node_modules/")) continue;
    let directory = path.dirname(path.resolve(root, clean));
    while (true) {
      if (!directory.split(path.sep).includes("node_modules")) {
        throw new Error(`Cannot locate shipped package for ${input}`);
      }
      const manifest = path.join(directory, "package.json");
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name) break;
      directory = path.dirname(directory);
    }
    packages.add(path.relative(root, directory).split(path.sep).join("/"));
  }
  return [...packages].sort(compare);
}

function licenseFiles(directory, prefix = "") {
  const files = [];
  for (const name of readdirSync(directory).sort(compare)) {
    const file = path.join(directory, name);
    if (statSync(file).isFile() && /^(licen[sc]e|copying|notice|authors)([.\-_]|$)/i.test(name)) {
      files.push([prefix + name, readFileSync(file, "utf8").replaceAll("\r\n", "\n").trim()]);
    } else if (statSync(file).isDirectory() && /^(licenses?|notices?)$/i.test(name)) {
      files.push(...licenseFiles(file, `${prefix}${name}/`));
    }
  }
  return files;
}

export function generateNotices(surfaces, root) {
  const directories = [...new Set(Object.values(surfaces).flat())];
  const entries = directories.map((directory) => {
    const location = path.resolve(root, directory);
    const { name, version, license } = JSON.parse(readFileSync(path.join(location, "package.json"), "utf8"));
    if (!allowedLicenses.has(license)) {
      throw new Error(`Third-party notices: shipped ${name}@${version} has unapproved license ${JSON.stringify(license)}. Review its terms and the allowlist.`);
    }
    const files = licenseFiles(location);
    if (!files.some(([name, text]) => /(^|\/)(licen[sc]e|copying)([.\-_]|$)/i.test(name) && text)) {
      throw new Error(`Third-party notices: shipped ${name}@${version} has no nonempty LICENSE/COPYING file in node_modules.`);
    }
    const shippedIn = Object.keys(surfaces).filter((surface) => surfaces[surface].includes(directory)).sort(compare);
    return { name, version, license, shippedIn, files };
  }).sort((a, b) => compare(`${a.name}@${a.version}`, `${b.name}@${b.version}`));
  if (!entries.length) throw new Error("Third-party notices: bundle inventory is empty.");
  return "THIRD-PARTY NOTICES\n\nBundled application dependencies and copied assets.\nElectron and Chromium notices are supplied separately as LICENSE.electron.txt and LICENSES.chromium.html.\n\n"
    + entries.map(({ name, version, license, shippedIn, files }) =>
      `${"=".repeat(72)}\nPackage: ${name}\nVersion: ${version}\nLicense: ${license}\nShipped in: ${shippedIn.join(", ")}\n\n`
      + files.map(([name, text]) => `--- ${name} ---\n${text}\n`).join("\n")
    ).join("\n");
}

export function noticesFromBuild(root) {
  const provenance = path.join(root, "build", "third-party");
  const surfaces = JSON.parse(readFileSync(path.join(provenance, "surfaces.json"), "utf8"));
  return generateNotices(surfaces, root);
}

export function verifyPackagedNotices(resources, expected) {
  const actual = readFileSync(path.join(resources, "THIRD_PARTY_NOTICES.txt"), "utf8");
  if (actual !== expected) {
    throw new Error("Packaged THIRD_PARTY_NOTICES.txt does not cover the current bundle inventory/license texts.");
  }
}

// electron-builder runs this for every platform before assembling any installer/ZIP.
export default function checkPackagedNotices({ appOutDir, packager }) {
  const root = path.resolve(import.meta.dirname, "..");
  const resources = packager.getResourcesDir(appOutDir);
  verifyPackagedNotices(resources, noticesFromBuild(root));
}

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The jsdom environment serves modules from an http URL; resolve the source directory from its path.
const here = new URL(".", import.meta.url);
const src = here.protocol === "file:" ? fileURLToPath(here) : path.resolve(process.cwd(), `.${here.pathname}`);
const theme = readFileSync(path.join(src, "lib/theme.css"), "utf8");
const shared = readFileSync(path.join(src, "styles.css"), "utf8");
const design = readFileSync(path.join(src, "../../../DESIGN.md"), "utf8").replaceAll("\r\n", "\n");

const SCALE_WEIGHTS = new Set(["400", "500", "600", "700"]);
const BREAKPOINTS = new Set([1100, 760, 520]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (/\.(svelte|css)$/.test(entry.name)) yield file;
  }
}

function styleText(file: string): string {
  const text = readFileSync(file, "utf8");
  const css = file.endsWith(".css") ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join("\n");
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const sheets = [...walk(src)]
  .map((file) => ({ file: path.relative(src, file).replaceAll(path.sep, "/"), css: styleText(file) }))
  .filter((sheet) => sheet.css.trim());

function offenders(pattern: RegExp, accept: (match: RegExpMatchArray) => boolean, files = sheets) {
  return files.flatMap(({ file, css }) =>
    [...css.matchAll(pattern)].filter((match) => !accept(match)).map((match) => `${file}: ${match[0]}`));
}

function hex(value: string): [number, number, number] {
  return value.slice(1).match(/.{2}/g)!.map((pair) => parseInt(pair, 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: [number, number, number], background: [number, number, number]): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

const tokens = new Map([...theme.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], hex(match[2])]));
const token = (name: string) => {
  const value = tokens.get(name);
  if (!value) throw new Error(`theme.css has no hex token --${name}`);
  return value;
};

describe("renderer style guard", () => {
  it("uses only the four type-scale weights", () => {
    expect(offenders(/font-weight:\s*([^;]+);/g, (match) => SCALE_WEIGHTS.has(match[1].trim()))).toEqual([]);
    const shorthandWeights = (value: string) => [...value.matchAll(/(?<![\w.-])(\d{3,4}|bold|bolder|lighter)(?![\w.%])/g)].map((match) => match[1]);
    expect(offenders(/\bfont:\s*([^;]+);/g, (match) => shorthandWeights(match[1]).every((weight) => SCALE_WEIGHTS.has(weight)))).toEqual([]);
  });

  it("keeps literal colors in theme.css", () => {
    const components = sheets.filter((sheet) => sheet.file !== "lib/theme.css");
    expect(offenders(/#[0-9a-f]{3,8}\b/gi, () => false, components)).toEqual([]);
  });

  it("uses the documented breakpoints", () => {
    const widths = (prelude: string) => [...prelude.matchAll(/\(\s*(?:max|min)-width\s*:\s*(\d+)px\s*\)/g)].map((match) => Number(match[1]));
    expect(offenders(/@media([^{]*)\{/g, (match) => widths(match[1]).every((width) => BREAKPOINTS.has(width)))).toEqual([]);
  });

  it("keeps text tokens at AA on every surface", () => {
    const surfaces = ["surface", "surface-raised", "surface-sunken", "bg"];
    const failures = [];
    for (const text of ["text-primary", "text-secondary", "text-muted", "accent", "info", "warning", "danger"]) {
      for (const surface of surfaces) {
        const ratio = contrast(token(text), token(surface));
        if (ratio < 4.5) failures.push(`${text} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps field edges and the spinner track at 3:1 non-text contrast", () => {
    const failures = [];
    for (const surface of ["surface", "surface-raised", "surface-sunken"]) {
      const ratio = contrast(token("border-input"), token(surface));
      if (ratio < 3) failures.push(`border-input on ${surface}: ${ratio.toFixed(2)}`);
    }
    const spinner = shared.match(/\.spinner\s*\{[^}]*border:\s*2px solid rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/);
    expect(spinner, ".spinner track must be a white alpha over the surface").toBeTruthy();
    const alpha = Number(spinner![1]);
    for (const surface of ["surface", "surface-raised"]) {
      const track = token(surface).map((c) => Math.round(alpha * 255 + (1 - alpha) * c)) as [number, number, number];
      const ratio = contrast(track, token(surface));
      if (ratio < 3) failures.push(`spinner track on ${surface}: ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  });

  it("documents the shipped colors in DESIGN.md", () => {
    const block = design.match(/^colors:\n((?:  [^\n]*\n)+)/m);
    expect(block, "DESIGN.md front matter must list colors").toBeTruthy();
    const documented = [...block![1].matchAll(/^  ([a-z0-9-]+):\s*"(#[0-9a-f]{6})"/gim)];
    expect(documented.length).toBeGreaterThan(0);
    const tokenName = (name: string) => (name === "background" ? "bg" : name);
    const drift = documented
      .filter(([, name, value]) => tokens.get(tokenName(name))?.join() !== hex(value).join())
      .map(([, name, value]) => `${name}: DESIGN.md ${value}, theme.css ${tokens.has(tokenName(name)) ? `#${token(tokenName(name)).map((c) => c.toString(16).padStart(2, "0")).join("")}` : "missing"}`);
    expect(drift).toEqual([]);
  });
});

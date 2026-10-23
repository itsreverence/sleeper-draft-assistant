import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const document = new JSDOM(html).window.document;
const policies = document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]');
assert.equal(policies.length, 1, "Built renderer must contain exactly one CSP meta tag");

const policy = document.head.querySelector(':scope > meta[http-equiv="Content-Security-Policy" i]');
assert.ok(policy, "Built renderer CSP meta tag must be a direct child of head");
for (let element = policy.previousElementSibling; element; element = element.previousElementSibling) {
  assert.ok(
    element.matches('meta[charset]:not([http-equiv]), meta[name="viewport" i]:not([http-equiv]), title'),
    `Built renderer CSP must precede <${element.localName}> in head`,
  );
}

const content = policy.getAttribute("content");
assert.ok(content, "Built renderer CSP must have content");
const directives = new Map();
for (const directive of content.split(";")) {
  const [name, ...sources] = directive.split(/[\t\n\f\r ]+/).filter(Boolean);
  if (!name) continue;
  assert.match(name, /^[a-z-]+$/, "Built renderer CSP has an invalid directive name");
  assert.ok(!directives.has(name), `Built renderer CSP repeats ${name}`);
  directives.set(name, new Set(sources));
}

const expected = {
  "default-src": ["'self'"],
  "connect-src": ["'self'", "http://127.0.0.1:*", "http://localhost:*", "ws://127.0.0.1:*", "ws://localhost:*"],
  "font-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "object-src": ["'none'"],
  "frame-src": ["'none'"],
  "worker-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'self'"],
};
for (const [name, sources] of Object.entries(expected)) {
  assert.deepEqual(directives.get(name), new Set(sources), `Built renderer CSP ${name} changed`);
}
assert.equal(directives.size, Object.keys(expected).length, "Built renderer CSP has unexpected directives");

console.log("Built renderer CSP matches the shipped policy");

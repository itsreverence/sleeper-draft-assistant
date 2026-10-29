import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createLogger, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { redactViteLogMessage } from "./vite-log-redaction";

const logger = createLogger();
const defaultError = logger.error.bind(logger);
const defaultWarn = logger.warn.bind(logger);
logger.error = (message, options) => defaultError(redactViteLogMessage(message), options);
logger.warn = (message, options) => defaultWarn(redactViteLogMessage(message), options);

// Impeccable's live helper is allowed only in the Vite dev response. The
// packaged app keeps the strict CSP declared in index.html unchanged.
const impeccableLiveDevCsp: Plugin = {
  name: "impeccable-live-dev-csp",
  transformIndexHtml: {
    order: "post",
    handler(html, context) {
      if (!context.server) return html;

      return html.replace(
        "script-src 'self';",
        "script-src 'self' http://localhost:*;",
      );
    },
  },
};

export default defineConfig({
  base: "./",
  customLogger: logger,
  plugins: [svelte(), impeccableLiveDevCsp, {
    name: "shipped-package-inputs",
    generateBundle(_options, bundle) {
      const repoRoot = path.resolve(import.meta.dirname, "../..");
      const inputs = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          for (const id of Object.keys(output.modules)) inputs.add(id);
        } else {
          // Vite retains original source filenames for emitted assets (including fonts).
          for (const filename of output.originalFileNames) inputs.add(filename);
        }
      }
      // CSS is extracted rather than represented in chunk.modules.
      for (const id of this.getModuleIds()) {
        if (/\.css(?:\?|$)/.test(id)) inputs.add(id);
      }
      const directory = path.join(repoRoot, "build", "third-party");
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, "web-inputs.json"), JSON.stringify(
        [...inputs].filter((id) => id.includes("node_modules/") || id.includes("node_modules\\"))
          .map((id) => path.relative(repoRoot, id).split(path.sep).join("/")).sort(),
        null, 2,
      ) + "\n");
    },
  }],
  resolve: process.env.VITEST ? {
    conditions: ["browser"],
  } : undefined,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/lib/testing/setup-component-tests.ts"],
  },
  server: {
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.PORT ?? "8787"}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

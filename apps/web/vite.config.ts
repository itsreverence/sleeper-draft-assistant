import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createLogger, defineConfig, type Plugin } from "vite";

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
  plugins: [svelte(), impeccableLiveDevCsp],
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

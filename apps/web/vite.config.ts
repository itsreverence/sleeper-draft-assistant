import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createLogger, defineConfig } from "vite";

import { redactViteLogMessage } from "./vite-log-redaction";

const logger = createLogger();
const defaultError = logger.error.bind(logger);
const defaultWarn = logger.warn.bind(logger);
logger.error = (message, options) => defaultError(redactViteLogMessage(message), options);
logger.warn = (message, options) => defaultWarn(redactViteLogMessage(message), options);

export default defineConfig({
  base: "./",
  customLogger: logger,
  plugins: [svelte()],
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

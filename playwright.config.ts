import { defineConfig } from "@playwright/test";

if (process.env.SDA_BROWSER_TEST !== "1") {
  throw new Error("Use npm run test:browser so data and authentication are isolated.");
}

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:15173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "compact", use: { viewport: { width: 480, height: 600 } } },
  ],
  webServer: [
    {
      command: "node --import tsx apps/api/src/index.ts",
      url: "http://127.0.0.1:18887/health",
      reuseExistingServer: false,
    },
    {
      command: "node node_modules/vite/bin/vite.js apps/web --host 127.0.0.1 --port 15173 --strictPort",
      url: "http://127.0.0.1:15173",
      reuseExistingServer: false,
    },
  ],
});

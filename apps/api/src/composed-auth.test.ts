import { afterEach, describe, expect, it, vi } from "vitest";

describe("composed API authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("leaves only health unauthenticated after mounting every route registrar", async () => {
    vi.stubEnv("SLEEPER_AI_API_TOKEN", "composed-app-test-capability");
    vi.stubEnv("SLEEPER_AI_TEST_ENFORCE_AUTH", "1");
    vi.resetModules();

    const { app } = await import("./index");
    const routes = app.routes.filter((route) => route.path !== "/*");

    for (const route of routes) {
      const path = route.path.replace(/:[^/]+/g, "test");
      const response = await app.request(path, { method: route.method });
      expect(response.status, `${route.method} ${route.path}`).toBe(
        route.method === "GET" && route.path === "/health" ? 200 : 401,
      );
    }
  });
});

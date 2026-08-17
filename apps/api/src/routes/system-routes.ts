import type { Hono } from "hono";

type SystemRouteDependencies = {
  createDiagnosticsPayload: () => unknown;
};

export function registerSystemRoutes(app: Hono, dependencies: SystemRouteDependencies): void {
  app.get("/diagnostics", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(dependencies.createDiagnosticsPayload());
  });
}

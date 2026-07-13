import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { requireApiToken } from "./api-auth";

describe("local API authentication", () => {
  function createApp() {
    const app = new Hono();
    app.use("*", requireApiToken("test-capability"));
    app.get("/health", (c) => c.json({ ok: true }));
    app.get("/settings", (c) => c.json({ ok: true }));
    app.get("/drafts/mock/events", (c) => c.text("event"));
    return app;
  }

  it("leaves only health and preflight unauthenticated", async () => {
    const app = createApp();
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/settings", { method: "OPTIONS" })).status).not.toBe(401);
    expect((await app.request("/settings")).status).toBe(401);
  });

  it("accepts the capability as a bearer token", async () => {
    const response = await createApp().request("/settings", {
      headers: { Authorization: "Bearer test-capability" },
    });
    expect(response.status).toBe(200);
  });

  it("accepts a query capability only for event streams", async () => {
    const app = createApp();
    expect((await app.request("/drafts/mock/events?apiToken=test-capability")).status).toBe(200);
    expect((await app.request("/settings?apiToken=test-capability")).status).toBe(401);
  });

  it("rejects missing or incorrect capabilities", async () => {
    const app = createApp();
    expect((await app.request("/settings", { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await app.request("/drafts/mock/events?apiToken=wrong")).status).toBe(401);
  });

  it("refuses to start without a capability outside tests", () => {
    expect(() => requireApiToken(null)).toThrow(/SLEEPER_AI_API_TOKEN/);
    expect(() => requireApiToken(null, { allowUnauthenticated: true })).not.toThrow();
  });
});

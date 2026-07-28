import { describe, expect, it } from "vitest";

import { app } from "./index";

describe("local data management routes", () => {
  it("returns aggregate inventory with cache prevention", async () => {
    const response = await app.request("/data");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual(
      expect.objectContaining({
        sqliteStorage: true,
        rankingImports: expect.any(Number),
        weeklyProjectionImports: expect.any(Number),
        decisionSnapshots: expect.any(Number),
      }),
    );
  });

  it("requires the exact server-side reset confirmation", async () => {
    const response = await app.request("/data/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Local data reset was not confirmed." });
  });

  it("rejects unknown data categories", async () => {
    const response = await app.request("/data/not-a-category", { method: "DELETE" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Unknown local data category." });
  });
});

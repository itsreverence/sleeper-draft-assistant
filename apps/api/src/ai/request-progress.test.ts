import { Hono } from "hono";
import { expect, it } from "vitest";
import { requireApiToken } from "../api-auth";
import { aiRequestOptions, registerAiProgress } from "./request-progress";

it("authenticates phase and cancellation routes and scopes them to an opaque request", async () => {
  const app = new Hono();
  app.use("*", requireApiToken("test-capability"));
  registerAiProgress(app);
  let release = () => {};
  let started = () => {};
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let initialStatus: unknown;
  app.post("/fixture/ask", async (c) => {
    const options = aiRequestOptions(c);
    initialStatus = await (await app.request(`/ai/requests/${id}`, { headers })).json();
    options.onPhase?.("news");
    started();
    await wait;
    return c.json({ current: await options.isCurrent?.() });
  });
  const id = "12345678-1234-1234-1234-123456789abc";
  const headers = { Authorization: "Bearer test-capability", "X-AI-Request": id };
  for (const method of ["GET", "DELETE"]) expect((await app.request(`/ai/requests/${id}`, { method })).status).toBe(401);
  const pending = app.request("/fixture/ask", { method: "POST", headers });
  await ready;
  expect(initialStatus).toEqual({ phase: "thinking" });
  expect(await (await app.request(`/ai/requests/${id}`, { headers })).json()).toEqual({ phase: "news" });
  expect(await (await app.request("/ai/requests/unknown", { headers })).json()).toEqual({ phase: null });
  expect((await app.request("/fixture/ask", { method: "POST", headers })).status).toBe(409);
  await app.request(`/ai/requests/${id}`, { method: "DELETE", headers });
  release();
  expect(await (await pending).json()).toEqual({ current: false });
  expect(await (await app.request(`/ai/requests/${id}`, { headers })).json()).toEqual({ phase: null });
});

import type { Context, Hono } from "hono";
import type { AiPhase, AiRequestOptions } from "./types";

const requests = new WeakMap<Request, { phase: AiPhase; cancelled: boolean }>();

export function registerAiProgress(app: Hono) {
  const active = new Map<string, { phase: AiPhase; cancelled: boolean }>();
  app.use("*", async (c, next) => {
    const key = c.req.header("X-AI-Request");
    if (c.req.method !== "POST" || !key || !/^[a-f0-9-]{36}$/.test(key)
      || !/(\/ask|\/strategy|\/evaluate)$/.test(c.req.path)) return next();
    if (active.has(key) || active.size >= 128) return c.json({ error: "AI request cannot be registered." }, 409);
    const state: { phase: AiPhase; cancelled: boolean } = { phase: "queued", cancelled: false };
    active.set(key, state);
    requests.set(c.req.raw, state);
    try { await next(); } finally { active.delete(key); requests.delete(c.req.raw); }
  });
  app.get("/ai/requests/:requestId", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ phase: active.get(c.req.param("requestId"))?.phase ?? null });
  });
  app.delete("/ai/requests/:requestId", (c) => {
    const state = active.get(c.req.param("requestId"));
    if (state) state.cancelled = true;
    return c.json({ ok: true });
  });
}

export function aiRequestOptions(c: Context): AiRequestOptions {
  const state = requests.get(c.req.raw);
  return {
    isCurrent: () => !c.req.raw.signal.aborted && !state?.cancelled,
    onPhase: (phase) => { if (state) state.phase = phase; },
  };
}

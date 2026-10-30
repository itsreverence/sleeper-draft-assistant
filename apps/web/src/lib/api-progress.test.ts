import { afterEach, expect, it, vi } from "vitest";
import { askTeamManagerRequest } from "./api";
import { createDeferred } from "./testing/deferred";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("starts with thinking and announces queued only when the server reports waiting", async () => {
  vi.useFakeTimers();
  const answer = createDeferred<Response>();
  const fetch = vi.fn()
    .mockImplementationOnce(() => answer.promise)
    .mockResolvedValueOnce(new Response(JSON.stringify({ phase: "queued" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ phase: "thinking" })));
  vi.stubGlobal("fetch", fetch);
  const phases: string[] = [];
  const pending = askTeamManagerRequest("league", "team", null, "Fixture", [], null, null, { onPhase: (phase) => phases.push(phase) });
  expect(phases).toEqual(["thinking"]);
  await vi.advanceTimersByTimeAsync(100);
  expect(phases).toEqual(["thinking", "queued"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(phases).toEqual(["thinking", "queued", "thinking"]);
  answer.resolve(new Response(JSON.stringify({ answer: "Fixture" })));
  await pending;
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("aborting a request cancels queued server work, closes the request and stops polling", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }
    return Promise.resolve(new Response(JSON.stringify(init?.method === "DELETE" ? { ok: true } : { phase: "queued" })));
  });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const pending = askTeamManagerRequest("league", "team", null, "Fixture", [], null, null, { signal: controller.signal });
  await vi.advanceTimersByTimeAsync(100);
  controller.abort();
  await expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1000);
  const calls = fetch.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${new URL(String(input), "http://127.0.0.1").pathname.replace(/[a-f0-9-]{36}$/, ":key")}`);
  expect(calls).toEqual(["POST /api/leagues/league/team/ask", "GET /api/ai/requests/:key", "DELETE /api/ai/requests/:key"]);
});

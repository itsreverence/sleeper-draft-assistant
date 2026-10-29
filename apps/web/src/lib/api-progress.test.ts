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

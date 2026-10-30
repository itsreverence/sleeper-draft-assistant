import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it, vi } from "vitest";

import type { AiRequestProgress } from "./api";
import { createDeferred } from "./testing/deferred";
import { settle } from "./testing/settle";
import { createDraftStrategySession, type StrategyTarget } from "./draft-strategy-session.svelte";
import type { AiDraftStrategyPayload, DraftOption, DraftState } from "./types";

function option(state: DraftState, index: number): DraftOption {
  const taken = new Set(state.picks.map((pick) => pick.playerId));
  const player = state.players.filter((entry) => !taken.has(entry.id))[index]!;
  return { player, rosterFit: "need", evidence: [], orderSource: "ecr", orderLabel: "ECR", requiredToCompleteLineup: true };
}

function payload(state: DraftState, label: string, pickNumber = state.currentPick): AiDraftStrategyPayload {
  return {
    provider: { id: "codex-app-server", label: "Codex", configured: true, availability: "available" },
    pickNumber,
    decision: {
      basedOnPick: pickNumber, recommendedPlayerId: option(state, 0).player.id, alternativePlayerIds: [], verdict: "strong", confidence: "high",
      headline: label, summary: label, reasons: ["Reason"], risks: [],
      plan: { updatedAtPick: pickNumber, approach: label, currentPickFocus: [], nextTurnPriorities: [], positionsThatCanWait: [], rosterGoals: ["Goal"], watchItems: [], changeSummary: "Note" },
    },
    recommendedCandidate: option(state, 0),
    alternativeCandidates: [option(state, 1)],
  };
}

function setup() {
  const state = createMockDraftState(8);
  const requests: Array<{ automatic: boolean; progress: AiRequestProgress; reply: ReturnType<typeof createDeferred<AiDraftStrategyPayload>> }> = [];
  const onCommitted = vi.fn();
  const session = createDraftStrategySession({
    request: (automatic, progress) => {
      const reply = createDeferred<AiDraftStrategyPayload>();
      requests.push({ automatic, progress, reply });
      return reply.promise;
    },
    getState: () => state,
    onCommitted,
  });
  const target = (overrides: Partial<StrategyTarget> = {}): StrategyTarget => ({ draftId: "draft", contextKey: "context", revision: "r1", wanted: true, ...overrides });
  return { state, requests, session, target, onCommitted };
}

describe("draft strategy session", () => {
  it("requests once per board and ignores a resync of the same one", () => {
    const { session, requests, target } = setup();
    session.sync(target());
    session.sync(target());
    expect(requests).toHaveLength(1);
    expect(requests[0]!.automatic).toBe(true);
    expect(session.loading).toBe(true);
  });

  it("does not request until the board is near the user's turn", () => {
    const { session, requests, target } = setup();
    session.sync(target({ wanted: false }));
    expect(requests).toHaveLength(0);
    session.sync(target({ revision: "r2" }));
    expect(requests).toHaveLength(1);
  });

  it("keeps the earlier request alive when the board moves and shows its answer until the newer one lands", async () => {
    const { session, requests, target, state, onCommitted } = setup();
    session.sync(target());
    session.sync(target({ revision: "r2" }));
    expect(requests).toHaveLength(2);
    expect(requests[0]!.progress.signal?.aborted).toBe(false);
    requests[0]!.reply.resolve(payload(state, "stale"));
    await settle();
    expect(session.call?.payload.decision.headline).toBe("stale");
    expect(session.call?.revision).toBe("r1");
    expect(session.loading).toBe(true);
    requests[1]!.reply.resolve(payload(state, "fresh"));
    await settle();
    expect(session.call?.payload.decision.headline).toBe("fresh");
    expect(session.loading).toBe(false);
    expect(onCommitted).toHaveBeenCalledTimes(2);
  });

  it("never lets a late answer replace a newer one", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    session.sync(target({ revision: "r2" }));
    requests[1]!.reply.resolve(payload(state, "fresh"));
    await settle();
    requests[0]!.reply.resolve(payload(state, "stale"));
    await settle();
    expect(session.call?.payload.decision.headline).toBe("fresh");
  });

  it("ignores a superseded request's error and phase", async () => {
    const { session, requests, target } = setup();
    session.sync(target());
    session.sync(target({ revision: "r2" }));
    requests[0]!.progress.onPhase?.("news");
    expect(session.phase).toBe("thinking");
    requests[0]!.reply.reject(new Error("Superseded"));
    await settle();
    expect(session.error).toBe("");
    expect(session.loading).toBe(true);
    requests[1]!.progress.onPhase?.("news");
    expect(session.phase).toBe("news");
  });

  it("aborts and discards in-flight answers when preferences change, but keeps the shown list", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    requests[0]!.reply.resolve(payload(state, "first"));
    await settle();
    session.sync(target({ contextKey: "pin", revision: "r2" }));
    session.sync(target({ contextKey: "exclude", revision: "r2" }));
    expect(requests[1]!.progress.signal?.aborted).toBe(true);
    requests[1]!.reply.resolve(payload(state, "wrong preferences"));
    await settle();
    expect(session.call?.payload.decision.headline).toBe("first");
    expect(requests).toHaveLength(3);
  });

  it("clears the call when the draft changes", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    requests[0]!.reply.resolve(payload(state, "first"));
    await settle();
    session.sync(target({ draftId: "other", revision: "other", wanted: false }));
    expect(session.call).toBeNull();
    expect(session.loading).toBe(false);
  });

  it("keeps the list on a failed refresh and retries explicitly", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    requests[0]!.reply.resolve(payload(state, "first"));
    await settle();
    session.sync(target({ revision: "r2" }));
    requests[1]!.reply.reject(new Error("Codex timed out"));
    await settle();
    expect(session.error).toBe("Codex timed out");
    expect(session.call?.payload.decision.headline).toBe("first");
    session.retry();
    expect(requests).toHaveLength(3);
    expect(requests[2]!.automatic).toBe(false);
    expect(session.error).toBe("");
  });

  it("cancels when leaving the room and re-requests on return", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    session.cancel();
    expect(requests[0]!.progress.signal?.aborted).toBe(true);
    expect(session.loading).toBe(false);
    requests[0]!.reply.resolve(payload(state, "late"));
    await settle();
    expect(session.call).toBeNull();
    session.sync(target());
    expect(requests).toHaveLength(2);
  });

  it("carries taken players from the previous call into the next one", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    const first = payload(state, "first");
    requests[0]!.reply.resolve(first);
    await settle();
    state.picks.push({ pickNo: state.currentPick, round: 1, draftSlot: 9, teamId: state.teams[1]!.id, playerId: first.recommendedCandidate.player.id });
    state.currentPick += 1;
    session.sync(target({ revision: "r2" }));
    requests[1]!.reply.resolve(payload(state, "second"));
    await settle();
    expect(session.call?.carried.map((entry) => entry.player.id)).toEqual([first.recommendedCandidate.player.id]);
  });

  it("forgets everything on reset", async () => {
    const { session, requests, target, state } = setup();
    session.sync(target());
    requests[0]!.reply.resolve(payload(state, "first"));
    await settle();
    session.reset();
    expect(session.call).toBeNull();
    expect(session.error).toBe("");
  });
});

import { render, screen, waitFor } from "@testing-library/svelte";
import { advanceMockDraftState, createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it, vi } from "vitest";

import type { AiDraftStrategyPayload, DraftState } from "../types";
import { createDeferred } from "../testing/deferred";
import RecommendationPanel from "./RecommendationPanel.svelte";

describe("Recommendation panel", () => {
  it("keeps the completed recommendation visible while the same board is re-evaluated", async () => {
    const state = createMockDraftState(8);
    const first = createDeferred<AiDraftStrategyPayload>();
    const second = createDeferred<AiDraftStrategyPayload>();
    const onRequestAiStrategy = vi.fn()
      .mockImplementationOnce(async () => await first.promise)
      .mockImplementationOnce(async () => await second.promise);

    const view = render(RecommendationPanel, {
      draftState: state,
      currentPick: state.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "initial",
      onRequestAiStrategy,
    });

    first.resolve(createStrategy(state, 0));
    expect(await screen.findByText("Target Jahmyr Gibbs at 2.08 if available")).toBeTruthy();

    await view.rerender({
      draftState: state,
      currentPick: state.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "preference-updated",
      onRequestAiStrategy,
    });

    await waitFor(() => expect(onRequestAiStrategy).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Target Jahmyr Gibbs at 2.08 if available")).toBeTruthy();
    expect(screen.getByText("Updating recommendation…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ask Codex" }) as HTMLButtonElement).disabled).toBe(true);

    second.resolve(createStrategy(state, 1));
    expect(await screen.findByText("Target A.J. Brown at 2.08 if available")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Updating recommendation…")).toBeNull());
    expect(screen.queryByText("Target Jahmyr Gibbs at 2.08 if available")).toBeNull();
  });

  it("marks the previous recommendation stale while evaluating an advanced board", async () => {
    const initialState = createMockDraftState(8);
    const advancedState = advanceMockDraftState(initialState);
    const first = createDeferred<AiDraftStrategyPayload>();
    const second = createDeferred<AiDraftStrategyPayload>();
    const onRequestAiStrategy = vi.fn()
      .mockImplementationOnce(async () => await first.promise)
      .mockImplementationOnce(async () => await second.promise);

    const view = render(RecommendationPanel, {
      draftState: initialState,
      currentPick: initialState.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "initial-board",
      onRequestAiStrategy,
    });

    const initialStrategy = createStrategy(initialState, 0);
    first.resolve(initialStrategy);
    expect(await screen.findByText("Target Jahmyr Gibbs at 2.08 if available")).toBeTruthy();

    await view.rerender({
      draftState: advancedState,
      currentPick: advancedState.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "advanced-board",
      onRequestAiStrategy,
    });

    await waitFor(() => expect(onRequestAiStrategy).toHaveBeenCalledTimes(2));
    expect(screen.getByText(`Previous: ${initialStrategy.decision.headline}`)).toBeTruthy();
    expect(screen.getByText("Previous recommendation")).toBeTruthy();
    expect(screen.getByText("Reviewing latest board…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ask Codex" }) as HTMLButtonElement).disabled).toBe(true);

    const replacementStrategy = createStrategy(advancedState, 1);
    second.resolve(replacementStrategy);
    expect(await screen.findByText(replacementStrategy.decision.summary)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Previous recommendation")).toBeNull());
    expect(screen.queryByText(initialStrategy.decision.headline)).toBeNull();
  });

  it("shows contingencies as a compact fallback order without an expansion step", async () => {
    const state = createMockDraftState(8);
    const strategy = createStrategy(state, 0);
    const onOpenPlayerSearch = vi.fn();

    render(RecommendationPanel, {
      draftState: state,
      currentPick: state.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "fallback-layout",
      onRequestAiStrategy: async () => strategy,
      onOpenPlayerSearch,
    });

    expect(await screen.findByRole("heading", { name: "If unavailable" })).toBeTruthy();
    const fallbackOrder = screen.getByLabelText("Fallback order");
    expect(Array.from(fallbackOrder.querySelectorAll(".fallback-rank")).map((rank) => rank.textContent)).toEqual(["1", "2", "3"]);
    expect(screen.getByText("9 picks away · High confidence · 4 between your picks")).toBeTruthy();
    for (const candidate of strategy.alternativeCandidates) {
      expect(screen.getByText(candidate.player.name)).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: `${strategy.alternativeCandidates.length} contingencies` })).toBeNull();
    const findPlayer = screen.getByRole("button", { name: "Find player" });
    await findPlayer.click();
    expect(onOpenPlayerSearch).toHaveBeenCalledOnce();
  });

  it("keeps the prior call as non-interactive context when a refresh fails", async () => {
    const state = createMockDraftState(8);
    const first = createDeferred<AiDraftStrategyPayload>();
    const second = createDeferred<AiDraftStrategyPayload>();
    const onRequestAiStrategy = vi.fn()
      .mockImplementationOnce(async () => await first.promise)
      .mockImplementationOnce(async () => await second.promise);

    const view = render(RecommendationPanel, {
      draftState: state,
      currentPick: state.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "initial",
      onRequestAiStrategy,
    });

    first.resolve(createStrategy(state, 0));
    expect(await screen.findByText("Target Jahmyr Gibbs at 2.08 if available")).toBeTruthy();

    await view.rerender({
      draftState: state,
      currentPick: state.currentPick,
      aiEnabled: true,
      aiStrategyEnabled: true,
      shouldRequestAiStrategy: true,
      strategyRequestKey: "failed-refresh",
      onRequestAiStrategy,
    });
    second.reject(new Error("Codex timed out"));

    expect(await screen.findByText("Recommendation update failed")).toBeTruthy();
    expect(screen.getByText("Codex timed out")).toBeTruthy();
    expect(screen.getByText("Target Jahmyr Gibbs at 2.08 if available")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ask Codex" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Retry recommendation" })).toBeTruthy();
  });
});

function createStrategy(state: DraftState, candidateIndex: number): AiDraftStrategyPayload {
  const draftedIds = new Set(state.picks.map((pick) => pick.playerId));
  const available = state.players.filter((player) => !draftedIds.has(player.id));
  const recommended = available[candidateIndex]!;
  const alternatives = available.slice(candidateIndex + 1, candidateIndex + 4);
  const option = (player: DraftState["players"][number]) => ({
    player,
    rosterFit: "need" as const,
    evidence: [`ECR rank ${player.importedRank ?? "unknown"}`],
    orderSource: "ecr" as const,
    orderLabel: "FantasyPros import",
    requiredToCompleteLineup: true,
  });

  return {
    provider: {
      id: "codex-app-server",
      label: "Codex app-server",
      configured: true,
      availability: "available",
    },
    pickNumber: state.currentPick,
    decision: {
      basedOnPick: state.currentPick,
      recommendedPlayerId: recommended.id,
      alternativePlayerIds: alternatives.map((player) => player.id),
      verdict: "strong",
      confidence: "high",
      headline: `Take ${recommended.name}`,
      summary: `${recommended.name} is the best available foundation for this roster.`,
      reasons: ["The top tier is about to close."],
      risks: ["Reassess if the board changes."],
      plan: {
        updatedAtPick: state.currentPick,
        approach: "Build an RB and WR foundation.",
        currentPickFocus: [recommended.position],
        nextTurnPriorities: ["WR"],
        positionsThatCanWait: ["QB"],
        rosterGoals: ["Add two starting receivers."],
        watchItems: ["Monitor the remaining top tier."],
        changeSummary: "Updated the next-pick target.",
      },
    },
    recommendedCandidate: option(recommended),
    alternativeCandidates: alternatives.map(option),
  };
}

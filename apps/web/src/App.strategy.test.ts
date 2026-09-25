import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./lib/api", async () => await import("./lib/testing/mock-api"));

import App from "./App.svelte";
import { apiMock } from "./lib/testing/mock-api";
import { createDraftPayloadFixture } from "./lib/testing/draft-fixtures";
import { createDeferred } from "./lib/testing/deferred";
import type { AiDraftStrategyPayload, DraftPayload } from "./lib/types";

afterEach(() => vi.restoreAllMocks());

it("keeps the parent draft plan on the latest same-pick correction when requests finish out of order", async () => {
  apiMock.reset();
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-20T12:00:00.000Z").getTime());
  const draftLoad = apiMock.deferDraftState({ draftId: "draft-1", userRosterId: null, userIdentifier: null });
  const initial = createDeferred<AiDraftStrategyPayload>();
  const updated = createDeferred<AiDraftStrategyPayload>();
  apiMock.fetchAiDraftStrategyRequest.mockReturnValueOnce(initial.promise as never).mockReturnValueOnce(updated.promise as never);
  render(App);
  await fireEvent.click(screen.getByRole("button", { name: "Paste a draft ID" }));
  await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), { target: { value: "draft-1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
  const payload = createDraftPayloadFixture({ draftId: "draft-1", name: "Live draft" });
  payload.state.userTeamId = payload.state.teams.find((team) => team.draftSlot === payload.state.currentPick)!.id;
  draftLoad.resolve(payload);
  await waitFor(() => expect(apiMock.fetchAiDraftStrategyRequest).toHaveBeenCalledTimes(1));
  const corrected = structuredClone(payload);
  corrected.state.picks[0]!.playerId = "corrected-pick";
  apiMock.eventSources[0]!.emit("snapshot", corrected);
  await waitFor(() => expect(apiMock.fetchAiDraftStrategyRequest).toHaveBeenCalledTimes(2));
  updated.resolve(strategy(corrected, "Current corrected plan"));
  await fireEvent.click(await screen.findByRole("button", { name: "Draft plan" }));
  const drawer = await screen.findByRole("dialog", { name: "Draft plan" });
  expect(await within(drawer).findByText("Current corrected plan")).toBeTruthy();
  initial.resolve(strategy(payload, "Obsolete plan"));
  await initial.promise;
  await tick();
  expect(within(drawer).getByText("Current corrected plan")).toBeTruthy();
  expect(within(drawer).queryByText("Obsolete plan")).toBeNull();
});

function strategy(payload: DraftPayload, approach: string): AiDraftStrategyPayload {
  const state = payload.state;
  const player = state.players.find((entry) => !state.picks.some((pick) => pick.playerId === entry.id))!;
  return {
    provider: { id: "codex-app-server", label: "Codex", configured: true, availability: "available" },
    pickNumber: state.currentPick,
    decision: {
      basedOnPick: state.currentPick, recommendedPlayerId: player.id, alternativePlayerIds: [],
      verdict: "strong", confidence: "high", headline: `Take ${player.name}`, summary: "Review the current evidence.", reasons: [], risks: [],
      plan: { updatedAtPick: state.currentPick, approach, currentPickFocus: [player.position], nextTurnPriorities: ["WR"],
        positionsThatCanWait: ["QB"], rosterGoals: [], watchItems: [], changeSummary: "Updated plan." },
    },
    recommendedCandidate: { player, rosterFit: "need", evidence: [], orderSource: "ecr", orderLabel: "ECR", requiredToCompleteLineup: true },
    alternativeCandidates: [],
  };
}

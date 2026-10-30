import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { draftStateRevision } from "@sleeper-draft-assistant/shared";
import { describe, expect, it, vi } from "vitest";

import { shortlistView, type StrategyCall } from "../draft-room";
import type { DraftOption, DraftState } from "../types";
import ShortlistPanel from "./ShortlistPanel.svelte";

function onClock(): DraftState {
  const state = createMockDraftState(8);
  return { ...state, userTeamId: state.teams.find((team) => team.draftSlot === state.currentPick)!.id };
}

function makeCall(state: DraftState): StrategyCall {
  const taken = new Set(state.picks.map((pick) => pick.playerId));
  const options: DraftOption[] = state.players.filter((player) => !taken.has(player.id)).slice(0, 3).map((player) => ({
    player, rosterFit: "need", evidence: [`ECR rank ${player.importedRank ?? "unknown"}`], orderSource: "ecr", orderLabel: "ECR", requiredToCompleteLineup: true,
  }));
  return {
    draftId: "draft", revision: draftStateRevision(state), carried: [],
    payload: {
      provider: { id: "codex-app-server", label: "Codex", configured: true, availability: "available" },
      pickNumber: state.currentPick,
      decision: {
        basedOnPick: state.currentPick, recommendedPlayerId: options[0]!.player.id, alternativePlayerIds: [], verdict: "strong", confidence: "high",
        headline: "Take", summary: "The full summary of the call.", reasonLine: "Best value at a need.", reasons: ["The top tier is about to close."], risks: ["Reassess if the board changes."],
        newsSources: [{ title: "Practice report", url: "https://www.nfl.com/news/report", reportedAt: "2026-10-29", checkedAt: "2026-10-30T00:00:00Z" }],
        plan: { updatedAtPick: state.currentPick, approach: "Plan", currentPickFocus: [], nextTurnPriorities: [], positionsThatCanWait: [], rosterGoals: ["Goal"], watchItems: [], changeSummary: "Note" },
      },
      recommendedCandidate: options[0]!,
      alternativeCandidates: options.slice(1),
    },
  };
}

function props(state: DraftState, call: StrategyCall | null, overrides: Record<string, unknown> = {}) {
  return {
    state, mode: "on-clock" as const, call, view: call ? shortlistView(state, call, {}) : null,
    aiEnabled: true, loading: false, phase: "thinking" as const, error: "", onRetry: vi.fn(), onOpenPlayerSearch: vi.fn(),
    ...overrides,
  };
}

describe("Shortlist panel", () => {
  it("renders one table with the same columns on every row and one reason line", () => {
    const state = onClock();
    const call = makeCall(state);
    render(ShortlistPanel, props(state, call));
    const table = screen.getByRole("table", { name: "Assistant's shortlist" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent?.trim())).toEqual(["Rank", "Position", "Assistant's shortlist", "ADP", "Proj"]);
    const names = [call.payload.recommendedCandidate, ...call.payload.alternativeCandidates].map((option) => option.player.name);
    expect(within(table).getAllByRole("rowheader").map((header) => header.querySelector(".name")?.textContent)).toEqual(names);
    expect(screen.getByText("Best value at a need.")).toBeTruthy();
    expect(screen.queryByText("The full summary of the call.")).toBeNull();
    expect(screen.queryByText(/Take /)).toBeNull();
    expect(screen.queryByText("Assistant alternative")).toBeNull();
    expect(document.querySelectorAll(".btn-primary")).toHaveLength(0);
  });

  it("opens every reason, risk, evidence and news source under Why this call", async () => {
    const state = onClock();
    render(ShortlistPanel, props(state, makeCall(state)));
    const toggle = screen.getByRole("button", { name: "Why this call" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(toggle);
    for (const text of ["The full summary of the call.", "The top tier is about to close.", "Reassess if the board changes.", "ECR rank unknown"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: /Practice report/ }).getAttribute("href")).toBe("https://www.nfl.com/news/report");
    expect(screen.getByRole("button", { name: /^Preference for / })).toBeTruthy();
  });

  it("strikes a taken target and says the promoted row is the Assistant's next choice", async () => {
    const state = onClock();
    const call = makeCall(state);
    const target = call.payload.recommendedCandidate.player;
    const teamId = state.teams.find((team) => team.id !== state.userTeamId)!.id;
    const next = { ...state, currentPick: state.currentPick + 1, picks: [...state.picks, { pickNo: state.currentPick, round: 1, draftSlot: 1, teamId, playerId: target.id }] };
    render(ShortlistPanel, props(next, call, { loading: true }));
    expect(document.querySelector(".taken s")?.textContent).toBe(target.name);
    expect(screen.getByText(/^Taken by /)).toBeTruthy();
    expect(document.querySelector(".top-row .name")?.textContent).toBe(call.payload.alternativeCandidates[0]!.player.name);
    expect(screen.getByText("The Assistant's next choice. New call on the way.")).toBeTruthy();
    expect(screen.getByRole("table", { name: /from pick 1\.09/ })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Why this call" }));
    expect(screen.getByText(`Written for ${target.name}, who is no longer available. A new call replaces it.`)).toBeTruthy();
  });

  it("points at Find player when every shortlist player is gone", async () => {
    const state = onClock();
    const call = makeCall(state);
    const teamId = state.teams.find((team) => team.id !== state.userTeamId)!.id;
    const picks = [...state.picks];
    for (const option of [call.payload.recommendedCandidate, ...call.payload.alternativeCandidates]) {
      picks.push({ pickNo: picks.length + 1, round: 1, draftSlot: 1, teamId, playerId: option.player.id });
    }
    const onOpenPlayerSearch = vi.fn();
    render(ShortlistPanel, props({ ...state, picks, currentPick: picks.length + 1 }, call, { onOpenPlayerSearch }));
    expect(screen.getByText("No player on this shortlist is available for your roster.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Find player" }));
    expect(onOpenPlayerSearch).toHaveBeenCalledOnce();
  });

  it("shows a quiet retry on a failed refresh and a phase before the first call", async () => {
    const state = onClock();
    const onRetry = vi.fn();
    const view = render(ShortlistPanel, props(state, makeCall(state), { error: "Codex timed out", onRetry }));
    expect(screen.getByText("Codex timed out")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Retry call" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await view.rerender(props(state, null, { loading: true, phase: "news" }));
    expect(screen.getByText("Checking news…")).toBeTruthy();
    await view.rerender(props(state, null, { error: "Codex timed out", onRetry }));
    expect(screen.getByText("Assistant call unavailable")).toBeTruthy();
    await view.rerender(props(state, null, { aiEnabled: false }));
    expect(screen.getByText("Set up the Assistant for draft strategy")).toBeTruthy();
  });

  it("labels an approaching list as targets", () => {
    const state = onClock();
    render(ShortlistPanel, props(state, makeCall(state), { mode: "approaching" }));
    expect(screen.getByRole("table", { name: "Targets if available" })).toBeTruthy();
  });
});

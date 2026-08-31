import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TeamActivityPanel from "./TeamActivityPanel.svelte";
import { createTeamPayloadFixture } from "../testing/draft-fixtures";

describe("Team activity panel", () => {
  it("keeps market details compact until requested", async () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]?.player;
    if (!starter) throw new Error("Expected starter fixture");
    const activitySummary = {
      ...payload.activitySummary,
      headline: "A waiver run is developing.",
      trendingAdds: [{ player: starter, count: 1200, direction: "add" as const }],
      recentTransactions: [{
        id: "transaction-1",
        type: "waiver",
        status: "complete",
        createdAt: null,
        rosterIds: ["roster-1"],
        addedPlayers: [starter],
        droppedPlayers: [],
        waiverBid: null,
        description: "My Team added Team Quarterback.",
      }],
    };

    render(TeamActivityPanel, { activitySummary });

    const disclosure = screen.getByRole("button", { name: /Market activity/ });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("View details")).toBeTruthy();
    expect(screen.queryByText("Market signals")).toBeNull();

    await fireEvent.click(disclosure);

    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Hide details")).toBeTruthy();
    expect(screen.getByText("Market signals")).toBeTruthy();
    expect(screen.getByText("A waiver run is developing.")).toBeTruthy();
    expect(screen.getByText("My Team added Team Quarterback.")).toBeTruthy();
    expect(screen.getByText(/not projections/)).toBeTruthy();
  });

  it("routes market questions to the shared Codex conversation", async () => {
    const payload = createTeamPayloadFixture();
    const onAsk = vi.fn();
    render(TeamActivityPanel, { activitySummary: payload.activitySummary, onAsk });

    await fireEvent.click(screen.getByRole("button", { name: /Market activity/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Ask Codex" }));

    expect(onAsk).toHaveBeenCalledWith("What does recent Sleeper activity say about my roster moves?");
  });
});

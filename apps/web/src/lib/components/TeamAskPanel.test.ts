import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TeamAskPanel from "./TeamAskPanel.svelte";
import { createAiProviderStatusFixture, createTeamPayloadFixture } from "../testing/draft-fixtures";

describe("Team ask panel", () => {
  it("configured provider submits team question", async () => {
    const teamPayload = createTeamPayloadFixture();
    const onAsk = vi.fn(async () => "Start your best running backs first.");

    render(TeamAskPanel, {
      teamState: teamPayload.state,
      teamNeeds: teamPayload.needs,
      lineupSummary: teamPayload.lineupSummary,
      weekContext: teamPayload.weekContext,
      waiverSummary: teamPayload.waiverSummary,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex app-server",
        configured: true,
      }),
      onAsk,
    });

    expect(screen.getByText("Codex app-server")).toBeTruthy();
    expect(screen.getByText("Fix RB/WR")).toBeTruthy();

    const textbox = screen.getByPlaceholderText("Ask about starters, weak spots, bench depth, or post-draft priorities.");
    await fireEvent.input(textbox, { target: { value: "What should I fix first?" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask team manager" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("What should I fix first?", []);
    });
    expect(await screen.findByText("Start your best running backs first.")).toBeTruthy();
  });
});

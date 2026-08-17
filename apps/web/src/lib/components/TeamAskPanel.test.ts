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
      weekContext: teamPayload.weekContext,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex app-server",
        configured: true,
      }),
      onAsk,
    });

    expect(screen.getByText("Codex app-server")).toBeTruthy();
    expect(screen.getByText("Roster plan")).toBeTruthy();

    const textbox = screen.getByPlaceholderText("Ask about your lineup, waivers, trades, or roster plan.");
    await fireEvent.input(textbox, { target: { value: "What should I fix first?" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Codex" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("What should I fix first?", []);
    });
    expect(await screen.findByText("Start your best running backs first.")).toBeTruthy();
  });

  it("noop provider stays disabled even when configured", async () => {
    const teamPayload = createTeamPayloadFixture();
    const onAsk = vi.fn(async () => "This should stay unavailable.");

    render(TeamAskPanel, {
      teamState: teamPayload.state,
      weekContext: teamPayload.weekContext,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "noop",
        label: "No AI provider",
        configured: true,
        availability: "disabled",
      }),
      onAsk,
    });

    const textbox = screen.getByPlaceholderText("Ask about your lineup, waivers, trades, or roster plan.");
    const button = screen.getByRole("button", { name: "Ask Codex" });

    expect(screen.getByText("Codex unavailable")).toBeTruthy();
    expect(textbox.getAttribute("disabled")).not.toBeNull();
    expect(button.getAttribute("disabled")).not.toBeNull();

    await fireEvent.click(button);
    expect(onAsk).not.toHaveBeenCalled();
  });
});

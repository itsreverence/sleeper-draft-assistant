import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TeamAskPanel from "./TeamAskPanel.svelte";
import { createAiProviderStatusFixture, createTeamPayloadFixture } from "../testing/draft-fixtures";
import { createDeferred } from "../testing/deferred";

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

  it("discards a pending answer when the active team changes", async () => {
    const firstTeam = createTeamPayloadFixture("league-a");
    const secondTeam = createTeamPayloadFixture("league-b");
    const firstAnswer = createDeferred<string>();
    const secondAnswer = createDeferred<string>();
    const onAsk = vi.fn(async (question: string) => {
      if (question === "Question A") return firstAnswer.promise;
      if (question === "Question B") return secondAnswer.promise;
      throw new Error(`Unexpected question: ${question}`);
    });
    const providerStatus = createAiProviderStatusFixture({
      id: "codex-app-server",
      label: "Codex",
      configured: true,
    });

    const view = render(TeamAskPanel, {
      teamState: firstTeam.state,
      weekContext: firstTeam.weekContext,
      activitySummary: firstTeam.activitySummary,
      providerStatus,
      onAsk,
    });

    const firstTextbox = screen.getByPlaceholderText("Ask about your lineup, waivers, trades, or roster plan.");
    await fireEvent.input(firstTextbox, { target: { value: "Question A" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Codex" }));
    await waitFor(() => expect(onAsk).toHaveBeenNthCalledWith(1, "Question A", []));

    await view.rerender({
      teamState: secondTeam.state,
      weekContext: secondTeam.weekContext,
      activitySummary: secondTeam.activitySummary,
      providerStatus,
      onAsk,
    });

    const secondTextbox = screen.getByPlaceholderText("Ask about your lineup, waivers, trades, or roster plan.");
    await fireEvent.input(secondTextbox, { target: { value: "Question B" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Codex" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(2, "Question B", []);
      expect(screen.getByText("Question B")).toBeTruthy();
      expect(screen.queryByText("Question A")).toBeNull();
    });

    firstAnswer.resolve("Answer A");
    await waitFor(() => {
      expect(screen.queryByText("Answer A")).toBeNull();
      expect(screen.getByText("Question B")).toBeTruthy();
    });

    secondAnswer.resolve("Answer B");
    expect(await screen.findByText("Answer B")).toBeTruthy();
  });
});

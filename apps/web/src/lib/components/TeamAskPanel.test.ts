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

    expect(screen.getByLabelText("Codex app-server ready")).toBeTruthy();
    expect(screen.getByTitle("Codex app-server")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ask Codex" })).toBeTruthy();
    expect(screen.getByText("Choose a prompt or ask your own.")).toBeTruthy();
    expect(screen.getByText("Review the plan")).toBeTruthy();

    const textbox = screen.getByRole("textbox", { name: "Ask Codex about your team" });
    await fireEvent.input(textbox, { target: { value: "What should I fix first?" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Codex" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("What should I fix first?", []);
    });
    expect(await screen.findByText("Start your best running backs first.")).toBeTruthy();
  });

  it("submits a decision starter through the shared conversation", async () => {
    const teamPayload = createTeamPayloadFixture();
    const onAsk = vi.fn(async () => "Keep the current starters.");

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

    await fireEvent.click(screen.getByRole("button", { name: "Who should I start this week?" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("Who should I start this week?", []);
    });
    expect(await screen.findByText("Keep the current starters.")).toBeTruthy();
  });

  it("offers a depth decision instead of weekly lineup advice during preseason", () => {
    const teamPayload = createTeamPayloadFixture();

    render(TeamAskPanel, {
      teamState: { ...teamPayload.state, seasonPhase: "preseason", week: null },
      weekContext: null,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex app-server",
        configured: true,
      }),
      onAsk: vi.fn(async () => "Review the roster depth."),
    });

    expect(screen.getByText("Depth")).toBeTruthy();
    expect(screen.getByText("Review weak spots")).toBeTruthy();
    expect(screen.queryByText("Choose starters")).toBeNull();
  });

  it("submits from the keyboard with Ctrl or Command plus Enter", async () => {
    const teamPayload = createTeamPayloadFixture();
    const onAsk = vi.fn(async () => "Keep the current lineup.");

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

    const textbox = screen.getByRole("textbox", { name: "Ask Codex about your team" });
    await fireEvent.input(textbox, { target: { value: "Should I change my lineup?" } });
    await fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("Should I change my lineup?", []);
    });
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

    const textbox = screen.getByRole("textbox", { name: "Ask Codex about your team" });
    const button = screen.getByRole("button", { name: "Ask Codex" });
    const decisionStarter = screen.getByRole("button", { name: "Who should I start this week?" });

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByTitle("Codex unavailable")).toBeTruthy();
    expect(textbox.getAttribute("disabled")).not.toBeNull();
    expect(button.getAttribute("disabled")).not.toBeNull();
    expect(decisionStarter.getAttribute("disabled")).not.toBeNull();

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

    const firstTextbox = screen.getByRole("textbox", { name: "Ask Codex about your team" });
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

    const secondTextbox = screen.getByRole("textbox", { name: "Ask Codex about your team" });
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

  it("opens the shared conversation for a contextual prompt request", async () => {
    const teamPayload = createTeamPayloadFixture();
    const onAsk = vi.fn(async () => "Investigate the market move before changing your roster.");
    const onPromptRequestHandled = vi.fn();

    const view = render(TeamAskPanel, {
      teamState: teamPayload.state,
      weekContext: teamPayload.weekContext,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex app-server",
        configured: true,
      }),
      onAsk,
      promptRequest: null,
      onPromptRequestHandled,
    });

    await view.rerender({
      teamState: teamPayload.state,
      weekContext: teamPayload.weekContext,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex app-server",
        configured: true,
      }),
      onAsk,
      promptRequest: { id: 1, question: "What does recent Sleeper activity say about my roster moves?" },
      onPromptRequestHandled,
    });

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("What does recent Sleeper activity say about my roster moves?", []);
    });
    expect(onPromptRequestHandled).toHaveBeenCalledWith(1);
    expect(await screen.findByText("Investigate the market move before changing your roster.")).toBeTruthy();
  });
});

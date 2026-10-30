import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

import type { AiRequestProgress } from "../api";
import TeamAskPanel from "./TeamAskPanel.svelte";
import { createAiProviderStatusFixture, createTeamPayloadFixture } from "../testing/draft-fixtures";
import { createDeferred } from "../testing/deferred";


// jsdom has no layout. Stack the thread's rows 100px apart so the scroll
// position the panel chooses is observable.
function stubThreadGeometry() {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const parent = this.parentElement;
    if (this.getAttribute("role") === "log" || !parent || parent.getAttribute("role") !== "log") return { top: 0 } as DOMRect;
    return { top: Array.from(parent.children).indexOf(this) * 100 - parent.scrollTop } as DOMRect;
  });
}

describe("Team ask panel", () => {
  it("moves focus to the composer when a starter prompt is removed", async () => {
    render(TeamAskPanel, {
      teamState: createTeamPayloadFixture().state,
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      onAsk: vi.fn(() => new Promise<string>(() => {})),
    });
    const starter = screen.getByLabelText("Ask Assistant starters").querySelector("button")!;
    starter.focus();
    await fireEvent.click(starter);
    await waitFor(() => expect(screen.queryByLabelText("Ask Assistant starters")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Ask Assistant about your team" }));
  });

  it("drops an in-flight news answer when the search setting changes", async () => {
    const answer = createDeferred<string>();
    const props = {
      teamState: createTeamPayloadFixture().state,
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      onAsk: vi.fn(() => answer.promise),
    };
    const view = render(TeamAskPanel, { ...props, contextKey: "true" });
    await fireEvent.input(screen.getByRole("textbox", { name: "Ask Assistant about your team" }), { target: { value: "Check player news" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await waitFor(() => expect(props.onAsk).toHaveBeenCalledOnce());
    await view.rerender({ ...props, contextKey: "false" });
    answer.resolve("Old news result");
    await waitFor(() => expect(screen.queryByText("Check player news")).toBeNull());
    expect(screen.queryByText("Old news result")).toBeNull();
  });
  it("discards a pending answer when the selected week changes even without matchup data", async () => {
    const teamPayload = createTeamPayloadFixture();
    const answer = createDeferred<string>();
    const onAsk = vi.fn(() => answer.promise);
    const props = {
      teamState: teamPayload.state,
      weekContext: null,
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      onAsk,
    };
    const view = render(TeamAskPanel, { ...props, selectedWeek: 1 });
    await fireEvent.input(screen.getByRole("textbox", { name: "Ask Assistant about your team" }), { target: { value: "Week one question" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await waitFor(() => expect(onAsk).toHaveBeenCalledOnce());
    await view.rerender({ ...props, selectedWeek: 2 });
    answer.resolve("Old week answer");
    await waitFor(() => expect(screen.queryByText("Week one question")).toBeNull());
    expect(screen.queryByText("Old week answer")).toBeNull();
    expect(screen.getByPlaceholderText("Ask something else…")).toBeTruthy();
  });

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
    expect(screen.getByRole("heading", { name: "Ask Assistant" })).toBeTruthy();
    expect(screen.getByText("Choose a prompt or ask your own.")).toBeTruthy();
    expect(screen.getByText("Review the plan")).toBeTruthy();

    const textbox = screen.getByRole("textbox", { name: "Ask Assistant about your team" });
    await fireEvent.input(textbox, { target: { value: "What should I fix first?" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("What should I fix first?", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
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

    await fireEvent.click(screen.getByRole("button", { name: "Lineup Choose starters" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("Who should I start this week?", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
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

    const textbox = screen.getByRole("textbox", { name: "Ask Assistant about your team" });
    await fireEvent.input(textbox, { target: { value: "Should I change my lineup?" } });
    await fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onAsk).toHaveBeenCalledWith("Should I change my lineup?", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
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

    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.getByText("The Assistant is disabled")).toBeTruthy();
    expect(screen.getByTitle("Assistant disabled")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Ask Assistant about your team" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lineup Choose starters" })).toBeNull();
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("offers retry and settings actions when Codex cannot start", async () => {
    const teamPayload = createTeamPayloadFixture();
    const onRetryProvider = vi.fn();
    const onOpenSettings = vi.fn();

    render(TeamAskPanel, {
      teamState: teamPayload.state,
      weekContext: teamPayload.weekContext,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex app-server",
        configured: false,
        availability: "unavailable",
        detail: "Codex could not start. Update the Codex CLI, run `codex login status`, and retry.",
      }),
      onAsk: vi.fn(async () => "Should not run"),
      onRetryProvider,
      onOpenSettings,
    });

    expect(screen.getByText("The Assistant could not start")).toBeTruthy();
    expect(screen.getByText(/Update the Codex CLI/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(onRetryProvider).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
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

    const firstTextbox = screen.getByRole("textbox", { name: "Ask Assistant about your team" });
    await fireEvent.input(firstTextbox, { target: { value: "Question A" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await waitFor(() => expect(onAsk).toHaveBeenNthCalledWith(1, "Question A", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) })));

    await view.rerender({
      teamState: secondTeam.state,
      weekContext: secondTeam.weekContext,
      activitySummary: secondTeam.activitySummary,
      providerStatus,
      onAsk,
    });

    const secondTextbox = screen.getByRole("textbox", { name: "Ask Assistant about your team" });
    await fireEvent.input(secondTextbox, { target: { value: "Question B" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(2, "Question B", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
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
      expect(onAsk).toHaveBeenCalledWith("What does recent Sleeper activity say about my roster moves?", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
    });
    expect(onPromptRequestHandled).toHaveBeenCalledWith(1);
    expect(await screen.findByText("Investigate the market move before changing your roster.")).toBeTruthy();
  });

  it("cancel returns the composer to idle and discards the late answer", async () => {
    const answer = createDeferred<string>();
    const onAsk = vi.fn(() => answer.promise);
    render(TeamAskPanel, {
      teamState: createTeamPayloadFixture().state,
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      onAsk,
    });
    await fireEvent.click(screen.getByRole("button", { name: "Lineup Choose starters" }));
    await waitFor(() => expect(onAsk).toHaveBeenCalledOnce());
    expect(screen.getByText("Thinking…")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Thinking…")).toBeNull();
    expect(screen.getByText(/^Cancelled\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask Assistant" })).toBeTruthy();

    answer.resolve("Late answer");
    await fireEvent.input(screen.getByRole("textbox", { name: "Ask Assistant about your team" }), { target: { value: "Follow-up" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Ask Assistant" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText("Late answer")).toBeNull();
    expect(screen.getByText("Who should I start this week?")).toBeTruthy();
  });

  it("scrolls the thread to the newest message as questions and answers arrive", async () => {
    const geometry = stubThreadGeometry();
    const second = createDeferred<string>();
    const onAsk = vi.fn().mockResolvedValueOnce("First answer").mockReturnValueOnce(second.promise);
    render(TeamAskPanel, {
      teamState: createTeamPayloadFixture().state,
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      onAsk,
    });
    await fireEvent.click(screen.getByRole("button", { name: "Lineup Choose starters" }));
    expect(await screen.findByText("First answer")).toBeTruthy();
    const log = screen.getByRole("log", { name: "Team conversation" });
    expect(log.scrollTop).toBe(100);

    await fireEvent.input(screen.getByRole("textbox", { name: "Ask Assistant about your team" }), { target: { value: "Second question" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await waitFor(() => expect(log.scrollTop).toBe(300));
    second.resolve("Second answer");
    expect(await screen.findByText("Second answer")).toBeTruthy();
    expect(log.scrollTop).toBe(300);
    geometry.mockRestore();
  });
});

async function openTeamComposer(onAsk: (question: string, history: import("../types").AiConversationMessage[], progress?: AiRequestProgress) => Promise<string>) {
  render(TeamAskPanel, {
    teamState: createTeamPayloadFixture().state,
    providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
    onAsk,
  });
  const textarea = screen.getByRole("textbox", { name: "Ask Assistant about your team" });
  await fireEvent.input(textarea, { target: { value: "Composer question" } });
  return textarea;
}

describe("Team ask panel composer focus", () => {
  it("keeps focus on the button a click turned into Cancel and returns it to the composer after Cancel", async () => {
    const answer = createDeferred<string>();
    const textarea = await openTeamComposer(vi.fn(() => answer.promise));
    const send = screen.getByRole("button", { name: "Ask Assistant" });
    send.focus();
    await fireEvent.click(send);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);

    await fireEvent.click(cancel);
    await tick();
    expect(screen.getByRole("button", { name: "Ask Assistant" })).toBeTruthy();
    expect(document.activeElement).toBe(textarea);
  });

  it("keeps focus in the composer when Ctrl+Enter submits from the textarea", async () => {
    const answer = createDeferred<string>();
    const textarea = await openTeamComposer(vi.fn(() => answer.promise));
    textarea.focus();
    await fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(document.activeElement).toBe(textarea);

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await tick();
    expect(document.activeElement).toBe(textarea);
  });

  it("returns focus to the composer when the answer arrives while Cancel is focused", async () => {
    const answer = createDeferred<string>();
    const textarea = await openTeamComposer(vi.fn(() => answer.promise));
    const send = screen.getByRole("button", { name: "Ask Assistant" });
    send.focus();
    await fireEvent.click(send);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    answer.resolve("Settled answer");
    expect(await screen.findByText("Settled answer")).toBeTruthy();
    await tick();
    expect(document.activeElement).toBe(textarea);
  });
});

describe("Team ask panel follow-up history", () => {
  it("cancel then re-ask sends neither half of the cancelled turn, and a completed turn is carried", async () => {
    const held = createDeferred<string>();
    const onAsk = vi.fn()
      .mockReturnValueOnce(held.promise)
      .mockResolvedValueOnce("Second answer")
      .mockResolvedValueOnce("Third answer");
    const textarea = await openTeamComposer(onAsk);
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    for (const [question, answer] of [["Second question", "Second answer"], ["Third question", "Third answer"]]) {
      await fireEvent.input(textarea, { target: { value: question } });
      await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
      expect(await screen.findByText(answer)).toBeTruthy();
    }
    expect(onAsk.mock.calls.map((call) => call[1])).toEqual([
      [],
      [],
      [{ role: "user", content: "Second question" }, { role: "assistant", content: "Second answer" }],
    ]);
  });

  it("retries the question under the bubble, not the most recent one", async () => {
    const teamPayload = createTeamPayloadFixture();
    const pending = createDeferred<string>();
    const onAsk = vi.fn(async (question: string) => question === "Question A" && onAsk.mock.calls.length === 1 ? pending.promise : `Answer to ${question}`);
    render(TeamAskPanel, {
      teamState: teamPayload.state,
      weekContext: teamPayload.weekContext,
      activitySummary: teamPayload.activitySummary,
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", label: "Codex", configured: true }),
      onAsk,
    });
    const ask = async (question: string) => {
      await fireEvent.input(screen.getByRole("textbox", { name: "Ask Assistant about your team" }), { target: { value: question } });
      await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    };

    await ask("Question A");
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await ask("Question B");
    await screen.findByText("Answer to Question B");
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("Answer to Question A");
    expect(onAsk.mock.calls.map(([question]) => question)).toEqual(["Question A", "Question B", "Question A"]);
  });
});

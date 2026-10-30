import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

import type { AiRequestProgress } from "../api";
import AskManagerPanel from "./AskManagerPanel.svelte";
import { createAiProviderStatusFixture, createDraftPayloadFixture } from "../testing/draft-fixtures";
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

describe("Ask manager panel", () => {
  it("moves focus to the composer when a suggestion chip is removed", async () => {
    const draft = createDraftPayloadFixture({ draftId: "synthetic-draft", name: "Synthetic draft" });
    render(AskManagerPanel, {
      onAsk: vi.fn(() => new Promise<never>(() => {})),
      providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      draftState: draft.state, recommendation: draft.recommendation, draftIdentity: "first",
    });
    const chip = screen.getByLabelText("Suggested questions").querySelector("button")!;
    chip.focus();
    await fireEvent.click(chip);
    await waitFor(() => expect(screen.queryByLabelText("Suggested questions")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Ask about your draft" }));
  });

  it("announces request phases and ignores progress after context changes", async () => {
    const draft = createDraftPayloadFixture({ draftId: "phase-fixture", name: "Phase fixture" });
    const reply = createDeferred<{ answer: string; strategyProposal: null }>();
    let progress: AiRequestProgress | undefined;
    const onAsk = vi.fn((_question: string, _history: unknown, options?: AiRequestProgress) => { progress = options; return reply.promise; });
    const view = render(AskManagerPanel, {
      onAsk, providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      draftState: draft.state, recommendation: draft.recommendation, draftIdentity: "first",
    });
    await fireEvent.input(screen.getByPlaceholderText("Ask about this draft…"), { target: { value: "Fixture question" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    for (const [phase, label] of [["queued", "Waiting for another Assistant request…"], ["thinking", "Thinking…"], ["news", "Checking news…"]] as const) {
      progress?.onPhase?.(phase);
      await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
    }
    await view.rerender({ draftIdentity: "second" });
    expect(progress?.signal?.aborted).toBe(true);
    progress?.onPhase?.("news");
    reply.resolve({ answer: "Old answer", strategyProposal: null });
    await waitFor(() => expect(screen.queryByText("Checking news…")).toBeNull());
    expect(screen.queryByText("Old answer")).toBeNull();
  });

  it("uses a compact command bar before the first question and a bounded thread afterward", async () => {
    const draft = createDraftPayloadFixture({
      draftId: "draft-command-bar",
      name: "Command Bar Draft",
    });
    const answer = createDeferred<{ answer: string; strategyProposal: null }>();
    const onAsk = vi.fn(async () => ({
      ...(await answer.promise),
      recommendation: draft.recommendation,
    }));

    render(AskManagerPanel, {
      onAsk,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex",
        configured: true,
      }),
      hasImportedRankings: true,
      draftState: draft.state,
      draftIdentity: `${draft.state.id}:slot-3`,
      recommendation: draft.recommendation,
    });
    expect(Array.from(screen.getByLabelText("Suggested questions").querySelectorAll("button"), (button) => button.textContent?.trim())).toEqual([
      "Best target",
      "Compare best options",
      "Pass on QB?",
    ]);

    const composer = screen.getByPlaceholderText("Ask about this draft…");
    expect(composer.tagName).toBe("INPUT");
    await fireEvent.input(composer, { target: { value: "Compare the top options" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    expect(await screen.findByRole("log", { name: "Draft conversation" })).toBeTruthy();
    expect(screen.queryByLabelText("Suggested questions")).toBeNull();
    expect(screen.getByPlaceholderText("Ask a follow-up about this draft.")).toBeTruthy();

    answer.resolve({ answer: "Take the best remaining elite receiver.", strategyProposal: null });
    expect(await screen.findByText("Take the best remaining elite receiver.")).toBeTruthy();
  });

  it("stale prior-draft ask completion does not clear a newer ask or alter its conversation", async () => {
    const firstDraft = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
    });
    const secondDraft = createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
    });
    const firstAnswer = createDeferred<{ answer: string; strategyProposal: null }>();
    const secondAnswer = createDeferred<{ answer: string; strategyProposal: null }>();

    const onAsk = vi.fn(async (question: string) => {
      if (question === "Question A") {
        const result = await firstAnswer.promise;
        return { ...result, recommendation: firstDraft.recommendation };
      }
      if (question === "Question B") {
        const result = await secondAnswer.promise;
        return { ...result, recommendation: secondDraft.recommendation };
      }
      throw new Error(`Unexpected question: ${question}`);
    });

    const view = render(AskManagerPanel, {
      onAsk,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex",
        configured: true,
      }),
      hasImportedRankings: true,
      draftState: firstDraft.state,
      draftIdentity: "draft-1:slot-3",
      recommendation: firstDraft.recommendation,
    });
    const textbox = screen.getByPlaceholderText("Ask about this draft…");
    await fireEvent.input(textbox, { target: { value: "Question A" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(1, "Question A", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    });

    await view.rerender({
      onAsk,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex",
        configured: true,
      }),
      hasImportedRankings: true,
      draftState: secondDraft.state,
      draftIdentity: "draft-2:slot-4",
      recommendation: secondDraft.recommendation,
    });

    const secondTextbox = screen.getByPlaceholderText("Ask about this draft…");
    await fireEvent.input(secondTextbox, { target: { value: "Question B" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(2, "Question B", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
      expect(screen.getByText("Question B")).toBeTruthy();
      expect(screen.queryByText("Question A")).toBeNull();
    });

    firstAnswer.resolve({ answer: "Answer A", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
      expect(screen.getByText("Question B")).toBeTruthy();
    });

    secondAnswer.resolve({ answer: "Answer B", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ask Assistant" })).toBeTruthy();
      expect(screen.getByText("Answer B")).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
    });
  });

  it("same draft id with a different draft identity invalidates the prior conversation and pending ask", async () => {
    const draft = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
    });
    const firstAnswer = createDeferred<{ answer: string; strategyProposal: null }>();
    const secondAnswer = createDeferred<{ answer: string; strategyProposal: null }>();

    const onAsk = vi.fn(async (question: string) => {
      if (question === "Question A") {
        const result = await firstAnswer.promise;
        return { ...result, recommendation: draft.recommendation };
      }
      if (question === "Question B") {
        const result = await secondAnswer.promise;
        return { ...result, recommendation: draft.recommendation };
      }
      throw new Error(`Unexpected question: ${question}`);
    });

    const view = render(AskManagerPanel, {
      onAsk,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex",
        configured: true,
      }),
      hasImportedRankings: true,
      draftState: draft.state,
      draftIdentity: "draft-1:slot-3",
      recommendation: draft.recommendation,
    });
    const textbox = screen.getByPlaceholderText("Ask about this draft…");
    await fireEvent.input(textbox, { target: { value: "Question A" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(1, "Question A", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    });

    await view.rerender({
      onAsk,
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        label: "Codex",
        configured: true,
      }),
      hasImportedRankings: true,
      draftState: draft.state,
      draftIdentity: "draft-1:slot-5",
      recommendation: draft.recommendation,
    });

    const secondTextbox = screen.getByPlaceholderText("Ask about this draft…");
    await fireEvent.input(secondTextbox, { target: { value: "Question B" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(2, "Question B", [], expect.objectContaining({ onPhase: expect.any(Function), signal: expect.any(AbortSignal) }));
      expect(screen.getByText("Question B")).toBeTruthy();
      expect(screen.queryByText("Question A")).toBeNull();
    });

    firstAnswer.resolve({ answer: "Answer A", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
    });

    secondAnswer.resolve({ answer: "Answer B", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ask Assistant" })).toBeTruthy();
      expect(screen.getByText("Answer B")).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
    });
  });

  it("cancel returns the composer to idle and discards the late answer", async () => {
    const draft = createDraftPayloadFixture({ draftId: "cancel-fixture", name: "Cancel fixture" });
    const reply = createDeferred<{ answer: string; strategyProposal: null }>();
    let progress: AiRequestProgress | undefined;
    const onAsk = vi.fn((_question: string, _history: unknown, options?: AiRequestProgress) => { progress = options; return reply.promise; });
    render(AskManagerPanel, {
      onAsk, providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      draftState: draft.state, recommendation: draft.recommendation, draftIdentity: "cancel",
    });
    const composer = screen.getByPlaceholderText("Ask about this draft…");
    await fireEvent.input(composer, { target: { value: "Cancelled question" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    expect(screen.getByText("Thinking…")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(progress?.signal?.aborted).toBe(true);
    expect(screen.queryByText("Thinking…")).toBeNull();
    expect(screen.getByText(/^Cancelled\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    reply.resolve({ answer: "Late answer", strategyProposal: null });
    await fireEvent.input(screen.getByPlaceholderText("Ask a follow-up about this draft."), { target: { value: "Next question" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Ask Assistant" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText("Late answer")).toBeNull();
    expect(screen.getByText("Cancelled question")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await waitFor(() => expect(onAsk).toHaveBeenLastCalledWith("Next question", [], expect.anything()));
  });

  it("scrolls the thread to the newest message as questions and answers arrive", async () => {
    const geometry = stubThreadGeometry();
    const draft = createDraftPayloadFixture({ draftId: "scroll-fixture", name: "Scroll fixture" });
    const second = createDeferred<{ answer: string; strategyProposal: null }>();
    const onAsk = vi.fn()
      .mockResolvedValueOnce({ answer: "First answer", strategyProposal: null })
      .mockReturnValueOnce(second.promise);
    render(AskManagerPanel, {
      onAsk, providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
      draftState: draft.state, recommendation: draft.recommendation, draftIdentity: "scroll",
    });
    await fireEvent.input(screen.getByPlaceholderText("Ask about this draft…"), { target: { value: "First question" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    expect(await screen.findByText("First answer")).toBeTruthy();
    const log = screen.getByRole("log", { name: "Draft conversation" });
    expect(log.scrollTop).toBe(100);

    await fireEvent.input(screen.getByPlaceholderText("Ask a follow-up about this draft."), { target: { value: "Second question" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await waitFor(() => expect(log.scrollTop).toBe(300));
    second.resolve({ answer: "Second answer", strategyProposal: null });
    expect(await screen.findByText("Second answer")).toBeTruthy();
    expect(log.scrollTop).toBe(300);
    geometry.mockRestore();
  });
});

async function openComposer(onAsk: (question: string, history: import("../types").AiConversationMessage[], progress?: AiRequestProgress) => Promise<{ answer: string; strategyProposal: null }>) {
  const draft = createDraftPayloadFixture({ draftId: "composer-fixture", name: "Composer fixture" });
  render(AskManagerPanel, {
    onAsk, providerStatus: createAiProviderStatusFixture({ id: "codex-app-server", configured: true }),
    draftState: draft.state, recommendation: draft.recommendation, draftIdentity: "composer",
  });
  const input = screen.getByPlaceholderText("Ask about this draft…");
  await fireEvent.input(input, { target: { value: "Composer question" } });
  return input;
}

describe("Ask manager panel composer focus", () => {
  it("keeps focus on the button a click turned into Cancel and returns it to the composer after Cancel", async () => {
    const reply = createDeferred<{ answer: string; strategyProposal: null }>();
    const input = await openComposer(vi.fn(() => reply.promise));
    const send = screen.getByRole("button", { name: "Ask Assistant" });
    send.focus();
    await fireEvent.click(send);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);

    await fireEvent.click(cancel);
    await tick();
    expect(screen.getByRole("button", { name: "Ask Assistant" })).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it("keeps focus in the composer when Enter submits from the input", async () => {
    const reply = createDeferred<{ answer: string; strategyProposal: null }>();
    const input = await openComposer(vi.fn(() => reply.promise));
    input.focus();
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(document.activeElement).toBe(input);

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await tick();
    expect(document.activeElement).toBe(input);
  });

  it("returns focus to the composer when the answer arrives while Cancel is focused", async () => {
    const reply = createDeferred<{ answer: string; strategyProposal: null }>();
    const input = await openComposer(vi.fn(() => reply.promise));
    const send = screen.getByRole("button", { name: "Ask Assistant" });
    send.focus();
    await fireEvent.click(send);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

    reply.resolve({ answer: "Settled answer", strategyProposal: null });
    expect(await screen.findByText("Settled answer")).toBeTruthy();
    await tick();
    expect(document.activeElement).toBe(input);
  });
});

describe("Ask manager panel follow-up history", () => {
  const history = (onAsk: ReturnType<typeof vi.fn>, call: number) => onAsk.mock.calls[call - 1][1];

  async function askFollowUp(question: string) {
    await fireEvent.input(screen.getByPlaceholderText("Ask a follow-up about this draft."), { target: { value: question } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
  }

  it("a normal follow-up carries the completed question and answer", async () => {
    const onAsk = vi.fn()
      .mockResolvedValueOnce({ answer: "First answer", strategyProposal: null })
      .mockResolvedValueOnce({ answer: "Second answer", strategyProposal: null });
    await openComposer(onAsk);
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    expect(await screen.findByText("First answer")).toBeTruthy();
    await askFollowUp("Follow-up question");
    expect(await screen.findByText("Second answer")).toBeTruthy();
    expect(history(onAsk, 1)).toEqual([]);
    expect(history(onAsk, 2)).toEqual([
      { role: "user", content: "Composer question" },
      { role: "assistant", content: "First answer" },
    ]);
  });

  it("cancel then re-ask sends neither half of the cancelled turn, now or later", async () => {
    const held = createDeferred<{ answer: string; strategyProposal: null }>();
    const onAsk = vi.fn()
      .mockReturnValueOnce(held.promise)
      .mockResolvedValueOnce({ answer: "Second answer", strategyProposal: null })
      .mockResolvedValueOnce({ answer: "Third answer", strategyProposal: null });
    await openComposer(onAsk);
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await askFollowUp("Second question");
    expect(await screen.findByText("Second answer")).toBeTruthy();
    await askFollowUp("Third question");
    expect(await screen.findByText("Third answer")).toBeTruthy();
    expect(onAsk.mock.calls.map(([question]) => question)).toEqual(["Composer question", "Second question", "Third question"]);
    expect(history(onAsk, 2)).toEqual([]);
    expect(history(onAsk, 3)).toEqual([
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second answer" },
    ]);
  });

  it("fail then Retry sends the question once with no history, and later turns carry only the retried answer", async () => {
    const onAsk = vi.fn()
      .mockRejectedValueOnce(new Error("The Assistant did not answer."))
      .mockResolvedValueOnce({ answer: "Recovered answer", strategyProposal: null })
      .mockResolvedValueOnce({ answer: "Next answer", strategyProposal: null });
    await openComposer(onAsk);
    await fireEvent.click(screen.getByRole("button", { name: "Ask Assistant" }));
    expect(await screen.findByText("The Assistant did not answer.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recovered answer")).toBeTruthy();
    expect(onAsk).toHaveBeenNthCalledWith(2, "Composer question", [], expect.anything());
    expect(screen.getAllByText("Composer question")).toHaveLength(2);
    await askFollowUp("Next question");
    expect(await screen.findByText("Next answer")).toBeTruthy();
    expect(history(onAsk, 3)).toEqual([
      { role: "user", content: "Composer question" },
      { role: "assistant", content: "Recovered answer" },
    ]);
  });
});

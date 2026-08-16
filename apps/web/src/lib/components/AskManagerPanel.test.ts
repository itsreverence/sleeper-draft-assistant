import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import AskManagerPanel from "./AskManagerPanel.svelte";
import { createAiProviderStatusFixture, createDraftPayloadFixture } from "../testing/draft-fixtures";
import { createDeferred } from "../testing/deferred";

describe("Ask manager panel", () => {
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

    await fireEvent.click(screen.getByRole("button", { name: /ask about this draft/i }));
    expect(screen.getByText("Context ready")).toBeTruthy();
    expect(screen.queryByText("AI context")).toBeNull();
    expect(screen.getByLabelText("Suggested questions").querySelectorAll("button")).toHaveLength(3);

    const composer = screen.getByPlaceholderText("Ask who to draft, compare players, or test a what-if.");
    expect(composer.tagName).toBe("INPUT");
    await fireEvent.input(composer, { target: { value: "Compare the top options" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

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

    await fireEvent.click(screen.getByRole("button", { name: /ask about this draft/i }));
    const textbox = screen.getByPlaceholderText("Ask who to draft, compare players, or test a what-if.");
    await fireEvent.input(textbox, { target: { value: "Question A" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(1, "Question A", []);
      expect(screen.getByRole("button", { name: "Asking" })).toBeTruthy();
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

    const secondTextbox = screen.getByPlaceholderText("Ask who to draft, compare players, or test a what-if.");
    await fireEvent.input(secondTextbox, { target: { value: "Question B" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(2, "Question B", []);
      expect(screen.getByRole("button", { name: "Asking" })).toBeTruthy();
      expect(screen.getByText("Question B")).toBeTruthy();
      expect(screen.queryByText("Question A")).toBeNull();
    });

    firstAnswer.resolve({ answer: "Answer A", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Asking" })).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
      expect(screen.getByText("Question B")).toBeTruthy();
    });

    secondAnswer.resolve({ answer: "Answer B", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ask AI" })).toBeTruthy();
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

    await fireEvent.click(screen.getByRole("button", { name: /ask about this draft/i }));
    const textbox = screen.getByPlaceholderText("Ask who to draft, compare players, or test a what-if.");
    await fireEvent.input(textbox, { target: { value: "Question A" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(1, "Question A", []);
      expect(screen.getByRole("button", { name: "Asking" })).toBeTruthy();
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

    const secondTextbox = screen.getByPlaceholderText("Ask who to draft, compare players, or test a what-if.");
    await fireEvent.input(secondTextbox, { target: { value: "Question B" } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    await waitFor(() => {
      expect(onAsk).toHaveBeenNthCalledWith(2, "Question B", []);
      expect(screen.getByText("Question B")).toBeTruthy();
      expect(screen.queryByText("Question A")).toBeNull();
    });

    firstAnswer.resolve({ answer: "Answer A", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Asking" })).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
    });

    secondAnswer.resolve({ answer: "Answer B", strategyProposal: null });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ask AI" })).toBeTruthy();
      expect(screen.getByText("Answer B")).toBeTruthy();
      expect(screen.queryByText("Answer A")).toBeNull();
    });
  });
});

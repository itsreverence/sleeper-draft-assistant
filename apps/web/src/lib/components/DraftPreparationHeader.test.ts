import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import DraftPreparationHeader from "./DraftPreparationHeader.svelte";

const baseProps = {
  draftName: "Fixture Draft",
  statusLabel: "Pre-draft",
  scoring: "PPR",
  season: "2026",
  teamLabel: "Fixture Team · Slot 3",
  hasRankings: true,
  rankingsStale: false,
  hasProjections: true,
  hasAdp: true,
  aiConfigured: true,
  onContinue: vi.fn(),
  onOpenEmergency: vi.fn(),
};

describe("DraftPreparationHeader", () => {
  it("names the draft status", () => {
    render(DraftPreparationHeader, { ...baseProps, statusLabel: "Drafting" });
    expect(screen.getByText(/Fixture Draft · Drafting · PPR/)).toBeTruthy();
  });

  it("enables normal entry only when all data and Codex are ready", () => {
    const { rerender } = render(DraftPreparationHeader, { ...baseProps, hasAdp: false });
    expect((screen.getByRole("button", { name: "Enter draft room" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Open emergency board only" })).toBeNull();

    rerender(baseProps);
    expect((screen.getByRole("button", { name: "Enter draft room" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers board-only recovery only after the live draft starts", async () => {
    const onOpenEmergency = vi.fn();
    render(DraftPreparationHeader, {
      ...baseProps,
      aiConfigured: false,
      liveDraft: true,
      onOpenEmergency,
    });

    await fireEvent.click(screen.getByRole("button", { name: "Open emergency board only" }));
    expect(onOpenEmergency).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/disables Assistant advice/i)).toBeTruthy();
  });
});

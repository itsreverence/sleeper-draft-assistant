import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ConnectPanel from "./ConnectPanel.svelte";

describe("Connection alternatives", () => {
  it("announces independent disclosures and preserves their lookup actions", async () => {
    const onFindLeagues = vi.fn();
    const onConnectSleeperDraft = vi.fn();
    render(ConnectPanel, {
      connectPayload: null,
      selectedLeagueId: "",
      selectedDraftId: "",
      isConnecting: false,
      isLoading: false,
      loadError: "",
      activeSourceLabel: "",
      activeDraftId: "",
      activeUserRosterId: null,
      onFindLeagues,
      onConnectSleeperDraft,
      onResetLookup: vi.fn(),
      onSelectLeague: vi.fn(),
      onSelectDraft: vi.fn(),
      onOpenSelectedDraft: vi.fn(),
      onLoadMockDraft: vi.fn(),
      showDemo: false,
    });
    const league = screen.getByRole("button", { name: "Paste a league URL" });
    const draft = screen.getByRole("button", { name: "Paste a draft ID" });
    expect(league.getAttribute("aria-expanded")).toBe("false");
    expect(draft.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(league);
    expect(league.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("League URL or ID")).toBeTruthy();
    expect(screen.getByText("Enter your Sleeper username above so we can identify your team in this league.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Find this league" }));
    expect(onFindLeagues).toHaveBeenCalledOnce();
    await fireEvent.click(draft);
    expect(draft.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Sleeper draft ID")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
    expect(onConnectSleeperDraft).toHaveBeenCalledOnce();
    await fireEvent.click(league);
    expect(league.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("League URL or ID")).toBeNull();
    expect(screen.getByLabelText("Sleeper draft ID")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try a demo draft" })).toBeNull();
  });
});

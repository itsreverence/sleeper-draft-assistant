import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/api", async () => await import("./lib/testing/mock-api"));
vi.mock("./lib/components/RecommendationPanel.svelte", async () => ({
  default: (await import("./lib/testing/RecommendationPanelProbe.svelte")).default,
}));
vi.mock("./lib/components/AskManagerPanel.svelte", async () => ({
  default: (await import("./lib/testing/AskManagerPanelProbe.svelte")).default,
}));

import App from "./App.svelte";
import { DEFAULT_LEAGUE_ID, PIN_PLAYER_ID, createDraftPayloadFixture } from "./lib/testing/draft-fixtures";
import { apiMock } from "./lib/testing/mock-api";

describe("App draft lifecycle", () => {
  beforeEach(() => {
    apiMock.reset();
    apiMock.teamPayload = {
      ...apiMock.teamPayload,
      state: {
        ...apiMock.teamPayload.state,
        league: {
          ...apiMock.teamPayload.state.league,
          id: DEFAULT_LEAGUE_ID,
        },
      },
    };
  });

  it("one activation commits state/storage/one EventSource", async () => {
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });

    render(App);

    await openDirectDraftForm();
    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Loading" })).toBeTruthy();
    });
    expect(apiMock.getOpenEventSources()).toHaveLength(0);

    draftLoad.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Alpha Draft")).toBeTruthy();
    await waitFor(() => expect(apiMock.getOpenEventSources()).toHaveLength(1));
    expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: A.J. Brown");
    expect(window.localStorage.getItem("lastDraftId")).toBe("draft-1");
    expect(window.localStorage.getItem("lastDraftTeamRef")).toBe("slot-3");
    expect(window.localStorage.getItem("lastLeagueId")).toBe(DEFAULT_LEAGUE_ID);
  });

  it("one preference update commits recommendation", async () => {
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const recommendationLoad = apiMock.deferRecommendation({
      draftId: "draft-1",
      userRosterId: "slot-3",
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    });

    render(App);

    await openAndResolveDraft(draftLoad, "draft-1", "Sleeper Alpha Draft");
    expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: A.J. Brown");

    await fireEvent.click(screen.getByRole("button", { name: "Prioritize De'Von Achane" }));

    expect(window.localStorage.getItem("playerPreferences:draft-1")).toBe(JSON.stringify({
      [PIN_PLAYER_ID]: "pin",
    }));
    expect(
      apiMock.recommendationRequests.find((request) =>
        request.draftId === "draft-1"
        && request.userRosterId === "slot-3"
        && request.recommendationPreferences.pinnedPlayerIds.includes(PIN_PLAYER_ID),
      ),
    ).toBeTruthy();

    recommendationLoad.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }).recommendation);

    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: De'Von Achane");
    });
  });

  it("exactly one EventSource and teardown closes", async () => {
    const firstDraft = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const secondDraft = apiMock.deferDraftState({
      draftId: "draft-2",
      userRosterId: null,
      userIdentifier: null,
    });

    const view = render(App);

    await openAndResolveDraft(firstDraft, "draft-1", "Sleeper Alpha Draft");
    const firstSource = apiMock.getOpenEventSources()[0]!;

    firstSource.emit("stream-error", {
      message: "Temporary upstream issue",
      consecutiveFailures: 2,
      nextRetryMs: 5_000,
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Reconnect draft sync")).toBeTruthy();
      expect(screen.getByLabelText(/Sleeper refresh failed 2 times/)).toBeTruthy();
    });
    await fireEvent.click(screen.getByLabelText("Reconnect draft sync"));
    await waitFor(() => {
      expect(firstSource.closeCalls).toBe(1);
      expect(apiMock.getOpenEventSources()).toHaveLength(1);
      expect(apiMock.eventSources).toHaveLength(2);
    });

    const reconnectSource = apiMock.getOpenEventSources()[0]!;

    await fireEvent.click(screen.getByTitle("Switch league or draft"));
    await fireEvent.click(screen.getAllByText("Paste a draft ID")[0]!);
    await fireEvent.input(screen.getAllByPlaceholderText("Paste a draft ID")[0]!, {
      target: { value: "draft-2" },
    });
    await fireEvent.click(screen.getAllByRole("button", { name: "Load draft" })[0]!);

    expect(reconnectSource.closeCalls).toBe(1);

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Beta Draft")).toBeTruthy();
    await waitFor(() => {
      expect(apiMock.getOpenEventSources()).toHaveLength(1);
    });

    const activeSource = apiMock.getOpenEventSources()[0]!;
    expect(activeSource.draftId).toBe("draft-2");

    view.unmount();
    expect(activeSource.closeCalls).toBe(1);
  });
});

async function openDirectDraftForm() {
  await fireEvent.click(screen.getByText("Paste a draft ID"));
}

async function openAndResolveDraft(
  deferredDraft: { resolve: (payload: ReturnType<typeof createDraftPayloadFixture>) => void },
  draftId: string,
  name: string,
) {
  await openDirectDraftForm();
  await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
    target: { value: draftId },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
  deferredDraft.resolve(createDraftPayloadFixture({
    draftId,
    name,
    leagueId: DEFAULT_LEAGUE_ID,
  }));
  expect(await screen.findByText(name)).toBeTruthy();
}

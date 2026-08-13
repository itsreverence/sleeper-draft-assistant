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
import { createDeferred } from "./lib/testing/deferred";
import { apiMock } from "./lib/testing/mock-api";
import type { ConnectPayload } from "./lib/types";

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

  it("shows the resolved team name and draft slot instead of the Sleeper roster ID", async () => {
    apiMock.settings = { ...apiMock.settings, aiSetupAcknowledged: false };
    apiMock.aiStatus = createDisabledAiStatus();
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const view = render(App);

    await openAndResolveDraft(draftLoad, "draft-1", "Sleeper Alpha Draft");

    const teamStatus = view.container.querySelector('[title^="Your team:"]');
    expect(teamStatus?.textContent).toContain("Your Team");
    expect(teamStatus?.textContent).toContain("Slot 3");
    expect(teamStatus?.textContent).not.toContain("Roster 3");
  });

  it("falls back to the assigned draft slot when the team name is unresolved", async () => {
    apiMock.settings = { ...apiMock.settings, aiSetupAcknowledged: false };
    apiMock.aiStatus = createDisabledAiStatus();
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: "slot-3",
      userIdentifier: null,
    });
    const view = render(App);

    await openDirectDraftForm();
    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-1" },
    });
    await fireEvent.input(screen.getByPlaceholderText("Optional"), {
      target: { value: "slot-3" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
    const payload = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    });
    payload.state.userTeamId = "unresolved-team";
    draftLoad.resolve(payload);

    expect(await screen.findByText("Sleeper Alpha Draft")).toBeTruthy();
    const teamStatus = view.container.querySelector('[title^="Your team:"]');
    expect(teamStatus?.textContent).toContain("Draft slot 3");
    expect(teamStatus?.textContent).not.toContain("Your Team");
  });

  it("offers active-draft emergency access without mounting AI features", async () => {
    apiMock.aiStatus = createDisabledAiStatus();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });

    render(App);
    await openAndResolveDraft(draftLoad, "draft-1", "Sleeper Alpha Draft");

    expect((screen.getByRole("button", { name: "Enter draft room" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("ask-manager-recommendation")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Open emergency board only" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Emergency board-only mode")).toBeTruthy();
    expect(screen.queryByTestId("ask-manager-recommendation")).toBeNull();
    expect(screen.queryByTestId("ask-manager-answer")).toBeNull();
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

  it("latest preference update wins and stale recommendation responses do not overwrite it", async () => {
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const pinnedRecommendation = apiMock.deferRecommendation({
      draftId: "draft-1",
      userRosterId: "slot-3",
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    });
    const fadedRecommendation = apiMock.deferRecommendation({
      draftId: "draft-1",
      userRosterId: "slot-3",
      recommendationPreferences: {
        pinnedPlayerIds: [],
        fadedPlayerIds: [PIN_PLAYER_ID],
        excludedPlayerIds: [],
      },
    });

    render(App);

    await openAndResolveDraft(draftLoad, "draft-1", "Sleeper Alpha Draft");
    expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: A.J. Brown");

    await fireEvent.click(screen.getByRole("button", { name: "Prioritize De'Von Achane" }));
    await fireEvent.click(screen.getByRole("button", { name: "Deprioritize De'Von Achane" }));

    fadedRecommendation.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [],
        fadedPlayerIds: [PIN_PLAYER_ID],
        excludedPlayerIds: [],
      },
    }).recommendation);

    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: A.J. Brown");
    });

    pinnedRecommendation.resolve(createDraftPayloadFixture({
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
      expect(screen.getByTestId("ask-manager-recommendation").textContent).not.toContain("Local reference: De'Von Achane");
    });
    expect(window.localStorage.getItem("playerPreferences:draft-1")).toBe(JSON.stringify({
      [PIN_PLAYER_ID]: "fade",
    }));
  });

  it("stale prior-draft recommendation responses do not overwrite the next active draft", async () => {
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
    const pinnedRecommendation = apiMock.deferRecommendation({
      draftId: "draft-1",
      userRosterId: "slot-3",
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    });

    render(App);

    await openAndResolveDraft(firstDraft, "draft-1", "Sleeper Alpha Draft");
    await fireEvent.click(screen.getByRole("button", { name: "Prioritize De'Von Achane" }));
    await fireEvent.click(screen.getByTitle("Switch league or draft"));
    await fireEvent.click(screen.getAllByText("Paste a draft ID")[0]!);
    await fireEvent.input(screen.getAllByPlaceholderText("Paste a draft ID")[0]!, {
      target: { value: "draft-2" },
    });
    await fireEvent.click(screen.getAllByRole("button", { name: "Load draft" })[0]!);

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Beta Draft")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: A.J. Brown");
    });

    pinnedRecommendation.resolve(createDraftPayloadFixture({
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
      expect(screen.getByText("Sleeper Beta Draft")).toBeTruthy();
      expect(screen.getByTestId("ask-manager-recommendation").textContent).not.toContain("Local reference: De'Von Achane");
    });
    expect(apiMock.getOpenEventSources()).toHaveLength(1);
    expect(apiMock.getOpenEventSources()[0]?.draftId).toBe("draft-2");
  });

  it("finding leagues from the switcher keeps the active draft stream alive", async () => {
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const connectLookup = createDeferred<ConnectPayload>();
    apiMock.fetchSleeperConnect.mockImplementationOnce(async () => await connectLookup.promise);

    render(App);

    await openAndResolveDraft(draftLoad, "draft-1", "Sleeper Alpha Draft");
    const activeSource = apiMock.getOpenEventSources()[0]!;

    await openDraftSwitcher();
    await fireEvent.input(screen.getByPlaceholderText("e.g. gridiron_gary"), {
      target: { value: "manager-one" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Find leagues" }));

    await waitFor(() => {
      expect(apiMock.fetchSleeperConnect).toHaveBeenCalledTimes(1);
    });
    expect(activeSource.closeCalls).toBe(0);
    expect(apiMock.getOpenEventSources()).toHaveLength(1);

    connectLookup.resolve(createConnectPayloadFixture());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open draft room" })).toBeTruthy();
    });

    await closeDraftSwitcher();

    expect(screen.getByText("Sleeper Alpha Draft")).toBeTruthy();
    expect(activeSource.closeCalls).toBe(0);
    expect(apiMock.getOpenEventSources()).toHaveLength(1);

    activeSource.emit("snapshot", createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: De'Von Achane");
    });
  });

  it("a rejected league lookup from the switcher keeps the active draft stream alive", async () => {
    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const connectLookup = createDeferred<ConnectPayload>();
    apiMock.fetchSleeperConnect.mockImplementationOnce(async () => await connectLookup.promise);

    render(App);

    await openAndResolveDraft(draftLoad, "draft-1", "Sleeper Alpha Draft");
    const activeSource = apiMock.getOpenEventSources()[0]!;

    await openDraftSwitcher();
    await fireEvent.input(screen.getByPlaceholderText("e.g. gridiron_gary"), {
      target: { value: "manager-one" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Find leagues" }));

    await waitFor(() => {
      expect(apiMock.fetchSleeperConnect).toHaveBeenCalledTimes(1);
    });
    expect(activeSource.closeCalls).toBe(0);
    expect(apiMock.getOpenEventSources()).toHaveLength(1);

    connectLookup.reject(new Error("Lookup unavailable"));

    expect(await screen.findByText("Lookup unavailable")).toBeTruthy();
    await closeDraftSwitcher();

    expect(screen.getByText("Sleeper Alpha Draft")).toBeTruthy();
    expect(activeSource.closeCalls).toBe(0);
    expect(apiMock.getOpenEventSources()).toHaveLength(1);

    activeSource.emit("snapshot", createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: De'Von Achane");
    });
  });

  it("opening a different draft after league lookup closes the prior stream once and replaces it", async () => {
    const firstDraft = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });
    const nextDraft = createDeferred<ReturnType<typeof createDraftPayloadFixture>>();
    apiMock.fetchSleeperConnect.mockResolvedValueOnce(createConnectPayloadFixture());

    render(App);

    await openAndResolveDraft(firstDraft, "draft-1", "Sleeper Alpha Draft");
    apiMock.fetchDraftState.mockImplementationOnce(async () => await nextDraft.promise);
    const firstSource = apiMock.getOpenEventSources()[0]!;

    await openDraftSwitcher();
    await fireEvent.input(screen.getByPlaceholderText("e.g. gridiron_gary"), {
      target: { value: "manager-one" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Find leagues" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open draft room" })).toBeTruthy();
    });
    expect(firstSource.closeCalls).toBe(0);
    expect(apiMock.getOpenEventSources()).toHaveLength(1);

    await fireEvent.click(screen.getByRole("button", { name: "Open draft room" }));

    await waitFor(() => {
      expect(apiMock.fetchDraftState).toHaveBeenCalledWith("draft-lookup", "slot-3", null);
    });
    expect(firstSource.closeCalls).toBe(1);

    nextDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-lookup",
      name: "Lookup Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Lookup Draft")).toBeTruthy();
    await waitFor(() => {
      expect(apiMock.getOpenEventSources()).toHaveLength(1);
    });
    expect(apiMock.getOpenEventSources()[0]?.draftId).toBe("draft-lookup");
    expect(firstSource.closeCalls).toBe(1);
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
    reconnectSource.emit("snapshot", createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }));
    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: De'Von Achane");
    });
    firstSource.emit("snapshot", createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));
    await waitFor(() => {
      expect(screen.getByTestId("ask-manager-recommendation").textContent).toContain("Local reference: De'Von Achane");
    });

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

  it("a stale activation failure does not clear a newer successful draft", async () => {
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

    render(App);

    await openDirectDraftForm();
    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));

    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-2" },
    });
    await fireEvent.submit(getDirectDraftForm());

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Beta Draft")).toBeTruthy();

    firstDraft.reject(new Error("Draft 1 unavailable"));

    await waitFor(() => {
      expect(screen.getByText("Sleeper Beta Draft")).toBeTruthy();
      expect(screen.queryByText("Draft 1 unavailable")).toBeNull();
    });
    expect(window.localStorage.getItem("lastDraftId")).toBe("draft-2");
    expect(apiMock.getOpenEventSources()).toHaveLength(1);
    expect(apiMock.getOpenEventSources()[0]?.draftId).toBe("draft-2");
  });

  it("a stale activation completion does not clear loading while a newer draft is still pending", async () => {
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

    render(App);

    await openDirectDraftForm();
    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));

    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-2" },
    });
    await fireEvent.submit(getDirectDraftForm());

    firstDraft.reject(new Error("Draft 1 unavailable"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Loading" })).toBeTruthy();
      expect(screen.queryByText("Draft 1 unavailable")).toBeNull();
    });

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Beta Draft")).toBeTruthy();
  });

  it("a stale rankings import response does not overwrite the next active draft", async () => {
    apiMock.settings = { ...apiMock.settings, aiSetupAcknowledged: false };
    apiMock.aiStatus = createDisabledAiStatus();

    const importPayload = createDeferred<Awaited<ReturnType<typeof apiMock.importRankingsRequest>>>();
    apiMock.importRankingsRequest.mockImplementationOnce(async () => await importPayload.promise);

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
    await uploadDraftDataCsv(view.container, 0, "rankings.csv", "name,team\nPlayer,ABC");

    await fireEvent.click(screen.getByTitle("Switch league or draft"));
    await fireEvent.click(screen.getAllByText("Paste a draft ID")[0]!);
    await fireEvent.input(screen.getAllByPlaceholderText("Paste a draft ID")[0]!, {
      target: { value: "draft-2" },
    });
    await fireEvent.click(screen.getAllByRole("button", { name: "Load draft" })[0]!);

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Beta Draft")).toBeTruthy();

    const staleImportPayload = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    });
    importPayload.resolve({
      ...staleImportPayload,
      summary: staleImportPayload.rankingImportSummary!,
    });

    await waitFor(() => {
      expect(screen.getByText("Sleeper Beta Draft")).toBeTruthy();
      expect(screen.queryByText("Sleeper Alpha Draft")).toBeNull();
    });
  });

  it("rankings import then clear overlap leaves no stuck busy flag and the stale import cannot win", async () => {
    apiMock.settings = { ...apiMock.settings, aiSetupAcknowledged: false };
    apiMock.aiStatus = createDisabledAiStatus();

    const importPayload = createDeferred<Awaited<ReturnType<typeof apiMock.importRankingsRequest>>>();
    const clearPayload = createDeferred<ReturnType<typeof createDraftPayloadFixture>>();
    apiMock.importRankingsRequest.mockImplementationOnce(async () => await importPayload.promise);
    apiMock.clearRankingsRequest.mockImplementationOnce(async () => await clearPayload.promise);

    const draftLoad = apiMock.deferDraftState({
      draftId: "draft-1",
      userRosterId: null,
      userIdentifier: null,
    });

    const view = render(App);

    await openDirectDraftForm();
    await fireEvent.input(screen.getByPlaceholderText("Paste a draft ID"), {
      target: { value: "draft-1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Load draft" }));
    const initialPayload = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    });
    draftLoad.resolve({
      ...initialPayload,
      seasonProjectionImportSummary: null,
      adpImportSummary: null,
    });
    expect(await screen.findByText("Sleeper Alpha Draft")).toBeTruthy();
    await waitFor(() => {
      expect(view.container.querySelectorAll('input[type="file"]').length).toBeGreaterThan(0);
    });
    await uploadDraftDataCsv(view.container, 0, "rankings.csv", "name,team\nPlayer,ABC");

    await waitFor(() => {
      expect(apiMock.importRankingsRequest).toHaveBeenCalledTimes(1);
    });

    await fireEvent.click(screen.getAllByRole("button", { name: "Clear" })[0]!);

    const clearedPayload = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    });
    clearPayload.resolve({
      ...clearedPayload,
      rankingImportSummary: null,
      seasonProjectionImportSummary: null,
      adpImportSummary: null,
    });

    await waitFor(() => {
      expect(screen.getAllByText("Upload CSV").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Importing")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    });

    const staleImportPayload = createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    });
    importPayload.resolve({
      ...staleImportPayload,
      summary: staleImportPayload.rankingImportSummary!,
    });

    await waitFor(() => {
      expect(screen.getAllByText("Upload CSV").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Importing")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    });
  });

  it("a stale ask response does not overwrite the next active draft recommendation", async () => {
    apiMock.aiStatus = {
      id: "codex-app-server",
      label: "Codex",
      configured: true,
    };

    const askPayload = createDeferred<{
      answer: string;
      recommendation: ReturnType<typeof createDraftPayloadFixture>["recommendation"];
      strategyProposal: null;
    }>();
    apiMock.askManagerRequest.mockImplementationOnce(async () => await askPayload.promise);

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

    render(App);

    await openAndResolveDraft(firstDraft, "draft-1", "Sleeper Alpha Draft");
    await fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    await fireEvent.click(screen.getByTitle("Switch league or draft"));
    await fireEvent.click(screen.getAllByText("Paste a draft ID")[0]!);
    await fireEvent.input(screen.getAllByPlaceholderText("Paste a draft ID")[0]!, {
      target: { value: "draft-2" },
    });
    await fireEvent.click(screen.getAllByRole("button", { name: "Load draft" })[0]!);

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    expect(await screen.findByText("Sleeper Beta Draft")).toBeTruthy();

    askPayload.resolve({
      answer: "Take Achane.",
      recommendation: createDraftPayloadFixture({
        draftId: "draft-1",
        name: "Sleeper Alpha Draft",
        leagueId: DEFAULT_LEAGUE_ID,
        recommendationPreferences: {
          pinnedPlayerIds: [PIN_PLAYER_ID],
          fadedPlayerIds: [],
          excludedPlayerIds: [],
        },
      }).recommendation,
      strategyProposal: null,
    });

    await waitFor(() => {
      expect(screen.getByText("Sleeper Beta Draft")).toBeTruthy();
      expect(screen.getByTestId("ask-manager-recommendation").textContent).not.toContain("Local reference: De'Von Achane");
      expect(screen.getByTestId("ask-manager-answer").textContent).toBe("");
      expect(screen.getByTestId("ask-manager-error").textContent).toBe("");
    });
  });
});

async function openDirectDraftForm() {
  await fireEvent.click(screen.getByText("Paste a draft ID"));
}

async function openDraftSwitcher() {
  await fireEvent.click(screen.getByTitle("Switch league or draft"));
  await screen.findByRole("dialog", { name: "Switch league or draft" });
}

async function closeDraftSwitcher() {
  await fireEvent.click(screen.getAllByLabelText("Close draft switcher")[0]!);
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Switch league or draft" })).toBeNull();
  });
}

function getDirectDraftForm(): HTMLFormElement {
  return screen.getByPlaceholderText("Paste a draft ID").closest("form") as HTMLFormElement;
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

async function uploadDraftDataCsv(container: HTMLElement, inputIndex: number, fileName: string, contents: string) {
  const fileInputs = Array.from(container.querySelectorAll('input[type="file"]'));
  const input = fileInputs[inputIndex] as HTMLInputElement | undefined;
  if (!input) {
    throw new Error(`No file input found at index ${inputIndex}.`);
  }

  const file = new File([contents], fileName, { type: "text/csv" });
  Object.defineProperty(file, "text", {
    value: async () => contents,
  });
  await fireEvent.change(input, { target: { files: [file] } });
}

function createConnectPayloadFixture(overrides: Partial<ConnectPayload> = {}): ConnectPayload {
  const base: ConnectPayload = {
    user: {
      userId: "user-1",
      username: "manager-one",
      displayName: "Manager One",
    },
    season: "2026",
    leagues: [{
      leagueId: DEFAULT_LEAGUE_ID,
      name: "Fixture League",
      season: "2026",
      status: "in_season",
      totalRosters: 12,
      scoring: "PPR",
      rosterSlots: {
        QB: 1,
        RB: 2,
        WR: 2,
        TE: 1,
        FLEX: 1,
        BN: 6,
      },
      userRosterId: "roster-3",
      recommendedDraftId: "draft-lookup",
      drafts: [{
        draftId: "draft-lookup",
        name: "Fixture Draft",
        status: "pre_draft",
        type: "snake",
        season: "2026",
        teams: 12,
        rounds: 15,
        userDraftSlot: 3,
      }],
    }],
  };

  return {
    ...base,
    ...overrides,
  };
}

function createDisabledAiStatus() {
  return {
    id: "noop" as const,
    label: "No AI provider",
    configured: false,
    availability: "disabled" as const,
  };
}

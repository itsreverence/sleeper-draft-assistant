import { describe, expect, it, vi } from "vitest";

import { createDraftSession } from "./draft-session.svelte";
import { createDraftPayloadFixture, DEFAULT_LEAGUE_ID, PIN_PLAYER_ID } from "./testing/draft-fixtures";
import { createDeferred } from "./testing/deferred";
import { FakeEventSource } from "./testing/fake-event-source";

describe("draft session", () => {
  it("latest activation wins when earlier draft responses resolve later", async () => {
    const firstDraft = createDeferred<ReturnType<typeof createDraftPayloadFixture>>();
    const secondDraft = createDeferred<ReturnType<typeof createDraftPayloadFixture>>();
    const eventSources: FakeEventSource[] = [];
    const committedDraftIds: string[] = [];

    const fetchDraftState = vi.fn(async (draftId: string) => {
      if (draftId === "draft-1") {
        return await firstDraft.promise;
      }
      if (draftId === "draft-2") {
        return await secondDraft.promise;
      }
      throw new Error(`Unexpected draft ${draftId}`);
    });

    const session = createDraftSession({
      fetchDraftState,
      fetchRecommendation: vi.fn(async () => {
        throw new Error("No recommendation request expected.");
      }),
      createEventSource: (draftId, userRosterId) => {
        const source = new FakeEventSource(draftId, userRosterId);
        eventSources.push(source);
        return source as unknown as EventSource;
      },
      getPlayerPreferences: () => ({}),
      isMockDraft: () => false,
      now: () => 1_000,
      storage: window.localStorage,
      onPayloadCommitted: () => {
        committedDraftIds.push(session.activeDraftId);
      },
    });

    const activationA = session.activate({
      draftId: "draft-1",
      draftTeamRef: null,
      leagueId: DEFAULT_LEAGUE_ID,
      userRosterId: null,
      userIdentifier: null,
    });
    const activationB = session.activate({
      draftId: "draft-2",
      draftTeamRef: null,
      leagueId: DEFAULT_LEAGUE_ID,
      userRosterId: null,
      userIdentifier: null,
    });

    secondDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-2",
      name: "Sleeper Beta Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    const winningActivation = await activationB;
    expect(winningActivation?.payload.state.id).toBe("draft-2");
    expect(session.draftState?.id).toBe("draft-2");
    expect(session.recommendation?.headline).toContain("A.J. Brown");
    expect(session.activeDraftId).toBe("draft-2");
    expect(window.localStorage.getItem("lastDraftId")).toBe("draft-2");
    expect(window.localStorage.getItem("lastDraftTeamRef")).toBe("slot-3");
    expect(window.localStorage.getItem("lastLeagueId")).toBe(DEFAULT_LEAGUE_ID);
    expect(eventSources).toHaveLength(1);
    expect(eventSources[0]?.draftId).toBe("draft-2");
    expect(committedDraftIds).toEqual(["draft-2"]);

    firstDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    await expect(activationA).resolves.toBeNull();
    expect(session.draftState?.id).toBe("draft-2");
    expect(session.activeDraftId).toBe("draft-2");
    expect(window.localStorage.getItem("lastDraftId")).toBe("draft-2");
    expect(window.localStorage.getItem("lastDraftTeamRef")).toBe("slot-3");
    expect(eventSources).toHaveLength(1);
    expect(eventSources[0]?.draftId).toBe("draft-2");
    expect(committedDraftIds).toEqual(["draft-2"]);
  });

  it("destroy invalidates a pending activation before it can commit state, storage, or stream ownership", async () => {
    const pendingDraft = createDeferred<ReturnType<typeof createDraftPayloadFixture>>();
    const eventSources: FakeEventSource[] = [];
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const onPayloadCommitted = vi.fn();

    const session = createDraftSession({
      fetchDraftState: vi.fn(async () => await pendingDraft.promise),
      fetchRecommendation: vi.fn(async () => {
        throw new Error("No recommendation request expected.");
      }),
      createEventSource: (draftId, userRosterId) => {
        const source = new FakeEventSource(draftId, userRosterId);
        eventSources.push(source);
        return source as unknown as EventSource;
      },
      getPlayerPreferences: () => ({}),
      isMockDraft: () => false,
      now: () => 1_000,
      storage,
      onPayloadCommitted,
    });

    const activation = session.activate({
      draftId: "draft-1",
      draftTeamRef: null,
      leagueId: DEFAULT_LEAGUE_ID,
      userRosterId: null,
      userIdentifier: null,
    });

    session.destroy();
    pendingDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    await expect(activation).resolves.toBeNull();
    expect(session.draftState).toBeNull();
    expect(session.activeDraftId).toBe("");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(eventSources).toHaveLength(0);
    expect(onPayloadCommitted).not.toHaveBeenCalled();
  });

  it("destroy invalidates a pending preference refresh before it can commit a recommendation", async () => {
    const pendingRecommendation = createDeferred<ReturnType<typeof createDraftPayloadFixture>["recommendation"]>();
    const onRecommendationCommitted = vi.fn();

    const session = createDraftSession({
      fetchDraftState: vi.fn(async () => createDraftPayloadFixture({
        draftId: "draft-1",
        name: "Sleeper Alpha Draft",
        leagueId: DEFAULT_LEAGUE_ID,
      })),
      fetchRecommendation: vi.fn(async () => await pendingRecommendation.promise),
      createEventSource: () => new FakeEventSource("draft-1", "slot-3") as unknown as EventSource,
      getPlayerPreferences: () => ({ "p-achane": "pin" }),
      isMockDraft: () => false,
      now: () => 1_000,
      storage: window.localStorage,
      onRecommendationCommitted,
    });

    await session.activate({
      draftId: "draft-1",
      draftTeamRef: null,
      leagueId: DEFAULT_LEAGUE_ID,
      userRosterId: null,
      userIdentifier: null,
    });

    const originalHeadline = session.recommendation?.headline;
    const refresh = session.applyCurrentPreferences({ "p-achane": "pin" });
    session.destroy();

    pendingRecommendation.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }).recommendation);

    await expect(refresh).resolves.toBe(false);
    expect(session.recommendation?.headline).toBe(originalHeadline);
    expect(onRecommendationCommitted).not.toHaveBeenCalled();
  });

  it("disconnect invalidates pending activation without leaving a reconnectable identity behind", async () => {
    const pendingDraft = createDeferred<ReturnType<typeof createDraftPayloadFixture>>();
    const eventSources: FakeEventSource[] = [];

    const session = createDraftSession({
      fetchDraftState: vi.fn(async () => await pendingDraft.promise),
      fetchRecommendation: vi.fn(async () => {
        throw new Error("No recommendation request expected.");
      }),
      createEventSource: (draftId, userRosterId) => {
        const source = new FakeEventSource(draftId, userRosterId);
        eventSources.push(source);
        return source as unknown as EventSource;
      },
      getPlayerPreferences: () => ({}),
      isMockDraft: () => false,
      now: () => 1_000,
      storage: window.localStorage,
    });

    const activation = session.activate({
      draftId: "draft-1",
      draftTeamRef: null,
      leagueId: DEFAULT_LEAGUE_ID,
      userRosterId: null,
      userIdentifier: null,
    });

    session.disconnect();
    pendingDraft.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
    }));

    await expect(activation).resolves.toBeNull();
    expect(session.activeDraftId).toBe("");
    expect(session.captureGuard()).toBeNull();
    expect(eventSources).toHaveLength(0);
  });

  it("disconnect preserves the active draft for reconnect while invalidating pre-disconnect work", async () => {
    const pendingRecommendation = createDeferred<ReturnType<typeof createDraftPayloadFixture>["recommendation"]>();
    const eventSources: FakeEventSource[] = [];

    const session = createDraftSession({
      fetchDraftState: vi.fn(async () => createDraftPayloadFixture({
        draftId: "draft-1",
        name: "Sleeper Alpha Draft",
        leagueId: DEFAULT_LEAGUE_ID,
      })),
      fetchRecommendation: vi.fn(async () => await pendingRecommendation.promise),
      createEventSource: (draftId, userRosterId) => {
        const source = new FakeEventSource(draftId, userRosterId);
        eventSources.push(source);
        return source as unknown as EventSource;
      },
      getPlayerPreferences: () => ({ "p-achane": "pin" }),
      isMockDraft: () => false,
      now: () => 1_000,
      storage: window.localStorage,
    });

    await session.activate({
      draftId: "draft-1",
      draftTeamRef: null,
      leagueId: DEFAULT_LEAGUE_ID,
      userRosterId: null,
      userIdentifier: null,
    });

    const firstSource = eventSources[0]!;
    const originalHeadline = session.recommendation?.headline;
    const refresh = session.applyCurrentPreferences({ "p-achane": "pin" });

    session.disconnect();

    expect(session.activeDraftId).toBe("draft-1");
    expect(session.captureGuard()).not.toBeNull();

    firstSource.emit("snapshot", createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }));

    expect(session.recommendation?.headline).toBe(originalHeadline);

    session.reconnect();
    expect(firstSource.closeCalls).toBe(1);
    expect(eventSources).toHaveLength(2);

    const reconnectSource = eventSources[1]!;
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

    expect(session.recommendation?.headline).toContain("De'Von Achane");

    pendingRecommendation.resolve(createDraftPayloadFixture({
      draftId: "draft-1",
      name: "Sleeper Alpha Draft",
      leagueId: DEFAULT_LEAGUE_ID,
      recommendationPreferences: {
        pinnedPlayerIds: [PIN_PLAYER_ID],
        fadedPlayerIds: [],
        excludedPlayerIds: [],
      },
    }).recommendation);

    await expect(refresh).resolves.toBe(false);
    expect(session.recommendation?.headline).toContain("De'Von Achane");
  });
});

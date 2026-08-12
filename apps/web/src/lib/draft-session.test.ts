import { describe, expect, it, vi } from "vitest";

import { createDraftSession } from "./draft-session.svelte";
import { createDraftPayloadFixture, DEFAULT_LEAGUE_ID } from "./testing/draft-fixtures";
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
});

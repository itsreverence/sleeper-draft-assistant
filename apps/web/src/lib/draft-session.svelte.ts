import type {
  AdpImportSummary,
  DraftPayload,
  DraftRecommendation,
  DraftState,
  PlayerPreferences,
  RankingImportSummary,
  RecommendationPreferenceRequest,
  SeasonProjectionImportSummary,
} from "./types";

type DraftSessionStorage = Pick<Storage, "setItem" | "removeItem">;

type DraftSessionDependencies = {
  fetchDraftState: (draftId: string, userRosterId: string | null, userIdentifier?: string | null) => Promise<DraftPayload>;
  fetchRecommendation: (
    draftId: string,
    userRosterId: string | null,
    recommendationPreferences: RecommendationPreferenceRequest,
  ) => Promise<DraftRecommendation>;
  createEventSource: (draftId: string, userRosterId: string | null) => EventSource;
  getPlayerPreferences: () => PlayerPreferences;
  isMockDraft: (draftId: string) => boolean;
  now: () => number;
  storage: DraftSessionStorage;
  onPayloadCommitted?: () => void;
  onRecommendationCommitted?: () => void;
  onPreferenceRefreshFailed?: (message: string) => void;
  onStreamUpdate?: (update: { status: string; lastEvent: string }) => void;
};

type ActivateDraftInput = {
  draftId: string;
  draftTeamRef: string | null;
  leagueId?: string;
  userRosterId?: string | null;
  userIdentifier?: string | null;
};

type ActivateDraftResult = {
  payload: DraftPayload;
  resolvedDraftTeamRef: string | null;
  resolvedLeagueId: string;
  userRosterId: string | null;
};

type CommitPayloadOptions = {
  refreshPreferences?: boolean;
};

function recommendationPreferenceRequest(preferences: PlayerPreferences): RecommendationPreferenceRequest {
  const request: RecommendationPreferenceRequest = {
    pinnedPlayerIds: [],
    fadedPlayerIds: [],
    excludedPlayerIds: [],
  };

  for (const [playerId, preference] of Object.entries(preferences)) {
    if (preference === "pin") {
      request.pinnedPlayerIds.push(playerId);
    } else if (preference === "fade") {
      request.fadedPlayerIds.push(playerId);
    } else if (preference === "exclude") {
      request.excludedPlayerIds.push(playerId);
    }
  }

  return request;
}

function hasPlayerPreferences(preferences: PlayerPreferences): boolean {
  return Object.keys(preferences).length > 0;
}

function draftIdentityKey(draftId: string, draftTeamRef: string | null): string {
  return `${draftId}:${draftTeamRef ?? ""}`;
}

function requestedDraftIdentityKey(input: ActivateDraftInput): string {
  return draftIdentityKey(input.draftId, input.draftTeamRef ?? input.userRosterId ?? null);
}

function formatPollTime(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function createDraftSession({
  fetchDraftState,
  fetchRecommendation,
  createEventSource,
  getPlayerPreferences,
  isMockDraft,
  now,
  storage,
  onPayloadCommitted,
  onRecommendationCommitted,
  onPreferenceRefreshFailed,
  onStreamUpdate,
}: DraftSessionDependencies) {
  let draftState: DraftState | null = $state(null);
  let recommendation: DraftRecommendation | null = $state(null);
  let rankingImportSummary: RankingImportSummary | null = $state(null);
  let seasonProjectionImportSummary: SeasonProjectionImportSummary | null = $state(null);
  let adpImportSummary: AdpImportSummary | null = $state(null);
  let activeDraftId = $state("");
  let activeDraftTeamRef: string | null = $state(null);
  let activeUserRosterId: string | null = $state(null);
  let draftLastSuccessfulAt: number | null = $state(null);
  let draftConsecutiveFailures = $state(0);
  let draftNextRetryMs = $state(0);
  let draftReconnecting = $state(false);

  let eventSource: EventSource | null = null;
  let activationEpoch = 0;
  let preferenceRevision = 0;
  let activeIdentity = "";
  let pendingIdentity = "";
  let streamConnectionId = 0;

  function resetDraftSyncTracking() {
    draftLastSuccessfulAt = null;
    draftConsecutiveFailures = 0;
    draftNextRetryMs = 0;
    draftReconnecting = false;
  }

  function markDraftSyncSuccessful(at?: string) {
    const parsed = at ? new Date(at).getTime() : now();
    draftLastSuccessfulAt = Number.isFinite(parsed) ? parsed : now();
    draftConsecutiveFailures = 0;
    draftNextRetryMs = 0;
    draftReconnecting = false;
  }

  function closeEventSource() {
    streamConnectionId += 1;
    eventSource?.close();
    eventSource = null;
  }

  function writeDraftStorage(draftId: string, draftTeamRef: string | null, userRosterId: string | null, leagueId: string) {
    if (isMockDraft(draftId)) {
      storage.removeItem("lastDraftId");
      storage.removeItem("lastDraftTeamRef");
      storage.removeItem("lastUserRosterId");
      storage.removeItem("lastLeagueId");
      return;
    }

    storage.setItem("lastDraftId", draftId);
    if (draftTeamRef) {
      storage.setItem("lastDraftTeamRef", draftTeamRef);
    } else {
      storage.removeItem("lastDraftTeamRef");
    }
    if (userRosterId) {
      storage.setItem("lastUserRosterId", userRosterId);
    } else {
      storage.removeItem("lastUserRosterId");
    }
    if (leagueId) {
      storage.setItem("lastLeagueId", leagueId);
    } else {
      storage.removeItem("lastLeagueId");
    }
  }

  function applyPayload(payload: DraftPayload) {
    draftState = payload.state;
    recommendation = payload.recommendation;
    rankingImportSummary = payload.rankingImportSummary;
    seasonProjectionImportSummary = payload.seasonProjectionImportSummary;
    adpImportSummary = payload.adpImportSummary;
    onPayloadCommitted?.();
  }

  function currentStreamConnectedStatus(draftId: string): string {
    return isMockDraft(draftId) ? "Live mock stream connected" : "Sleeper polling connected";
  }

  function connectStream(draftId: string, draftTeamRef: string | null) {
    closeEventSource();
    const connectionId = streamConnectionId;
    const connectedIdentity = draftIdentityKey(draftId, draftTeamRef);
    const source = createEventSource(draftId, draftTeamRef);
    eventSource = source;

    const isCurrentConnection = () =>
      eventSource === source
      && connectionId === streamConnectionId
      && activeIdentity === connectedIdentity;

    const handlePayloadEvent = (event: Event, lastEvent: (payload: DraftPayload) => string) => {
      if (!isCurrentConnection()) {
        return;
      }
      const payload = JSON.parse((event as MessageEvent).data) as DraftPayload;
      applyCommittedPayload(payload, { refreshPreferences: true });
      onStreamUpdate?.({
        status: currentStreamConnectedStatus(draftId),
        lastEvent: lastEvent(payload),
      });
      markDraftSyncSuccessful();
    };

    source.addEventListener("snapshot", (event) => {
      handlePayloadEvent(event, () => "Snapshot received");
    });

    source.addEventListener("pick", (event) => {
      handlePayloadEvent(event, (payload) => `Pick ${payload.state.currentPick - 1} recorded`);
    });

    source.addEventListener("heartbeat", (event) => {
      if (!isCurrentConnection()) {
        return;
      }
      const payload = JSON.parse((event as MessageEvent).data) as { at?: string };
      markDraftSyncSuccessful(payload.at);
      onStreamUpdate?.({
        status: currentStreamConnectedStatus(draftId),
        lastEvent: isMockDraft(draftId)
          ? `Demo stream checked ${formatPollTime(payload.at)}`
          : `Sleeper checked ${formatPollTime(payload.at)}; no new picks`,
      });
    });

    source.addEventListener("stream-error", (event) => {
      if (!isCurrentConnection()) {
        return;
      }
      const payload = JSON.parse((event as MessageEvent).data) as {
        message?: string;
        consecutiveFailures?: number;
        nextRetryMs?: number;
      };
      const failures = payload.consecutiveFailures ?? 1;
      draftConsecutiveFailures = failures;
      draftNextRetryMs = payload.nextRetryMs ?? 0;
      draftReconnecting = false;
      onStreamUpdate?.({
        status: failures >= 3 ? "Sleeper polling degraded" : "Sleeper polling retrying",
        lastEvent: payload.message ? `Poll failed (${failures}): ${payload.message}` : `Poll failed (${failures})`,
      });
    });

    source.onerror = () => {
      if (!isCurrentConnection()) {
        return;
      }
      draftReconnecting = true;
      onStreamUpdate?.({
        status: isMockDraft(draftId) ? "Event stream reconnecting" : "Sleeper polling reconnecting",
        lastEvent: draftState ? "Waiting for event stream" : "Waiting for event stream",
      });
    };
  }

  async function applyCurrentPreferences(preferences: PlayerPreferences): Promise<boolean> {
    if (!activeDraftId || !draftState) {
      return false;
    }

    const requestEpoch = activationEpoch;
    const requestIdentity = activeIdentity;
    const requestRevision = ++preferenceRevision;
    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;

    try {
      const nextRecommendation = await fetchRecommendation(
        requestDraftId,
        requestDraftTeamRef,
        recommendationPreferenceRequest(preferences),
      );
      if (
        requestEpoch !== activationEpoch
        || requestIdentity !== activeIdentity
        || requestRevision !== preferenceRevision
        || requestDraftId !== activeDraftId
        || requestDraftTeamRef !== activeDraftTeamRef
      ) {
        return false;
      }

      recommendation = nextRecommendation;
      onRecommendationCommitted?.();
      return true;
    } catch (error) {
      if (
        requestEpoch !== activationEpoch
        || requestIdentity !== activeIdentity
        || requestRevision !== preferenceRevision
        || requestDraftId !== activeDraftId
        || requestDraftTeamRef !== activeDraftTeamRef
      ) {
        return false;
      }

      const message = error instanceof Error ? error.message : "Preference refresh failed";
      onPreferenceRefreshFailed?.(`Preference refresh failed: ${message}`);
      return false;
    }
  }

  function applyCommittedPayload(payload: DraftPayload, options: CommitPayloadOptions = {}) {
    applyPayload(payload);
    if (!options.refreshPreferences) {
      return;
    }
    const preferences = getPlayerPreferences();
    if (hasPlayerPreferences(preferences)) {
      void applyCurrentPreferences(preferences);
    }
  }

  function clear() {
    closeEventSource();
    draftState = null;
    recommendation = null;
    rankingImportSummary = null;
    seasonProjectionImportSummary = null;
    adpImportSummary = null;
    activeDraftId = "";
    activeDraftTeamRef = null;
    activeUserRosterId = null;
    activeIdentity = "";
    pendingIdentity = "";
    activationEpoch += 1;
    preferenceRevision += 1;
    resetDraftSyncTracking();
  }

  async function activate(input: ActivateDraftInput): Promise<ActivateDraftResult | null> {
    const requestEpoch = ++activationEpoch;
    preferenceRevision += 1;
    pendingIdentity = requestedDraftIdentityKey(input);
    closeEventSource();
    resetDraftSyncTracking();

    const payload = await fetchDraftState(input.draftId, input.draftTeamRef, input.userIdentifier ?? null);
    const resolvedDraftTeamRef = input.draftTeamRef
      ?? `slot-${payload.state.teams.find((team) => team.id === payload.state.userTeamId)?.draftSlot ?? 1}`;
    const resolvedLeagueId = input.leagueId || payload.state.leagueId || "";

    if (requestEpoch !== activationEpoch || pendingIdentity !== requestedDraftIdentityKey(input)) {
      return null;
    }

    activeDraftId = input.draftId;
    activeDraftTeamRef = resolvedDraftTeamRef;
    activeUserRosterId = input.userRosterId ?? null;
    activeIdentity = draftIdentityKey(input.draftId, resolvedDraftTeamRef);
    pendingIdentity = activeIdentity;
    applyPayload(payload);
    writeDraftStorage(input.draftId, resolvedDraftTeamRef, input.userRosterId ?? null, resolvedLeagueId);
    connectStream(input.draftId, resolvedDraftTeamRef);

    return {
      payload,
      resolvedDraftTeamRef,
      resolvedLeagueId,
      userRosterId: input.userRosterId ?? null,
    };
  }

  function reconnect() {
    if (!activeDraftId) {
      return;
    }
    connectStream(activeDraftId, activeDraftTeamRef);
  }

  function destroy() {
    closeEventSource();
  }

  return {
    get draftState() {
      return draftState;
    },
    get recommendation() {
      return recommendation;
    },
    get rankingImportSummary() {
      return rankingImportSummary;
    },
    get seasonProjectionImportSummary() {
      return seasonProjectionImportSummary;
    },
    get adpImportSummary() {
      return adpImportSummary;
    },
    get activeDraftId() {
      return activeDraftId;
    },
    get activeDraftTeamRef() {
      return activeDraftTeamRef;
    },
    get activeUserRosterId() {
      return activeUserRosterId;
    },
    get draftLastSuccessfulAt() {
      return draftLastSuccessfulAt;
    },
    get draftConsecutiveFailures() {
      return draftConsecutiveFailures;
    },
    get draftNextRetryMs() {
      return draftNextRetryMs;
    },
    get draftReconnecting() {
      return draftReconnecting;
    },
    activate,
    applyCommittedPayload,
    applyCurrentPreferences,
    clear,
    reconnect,
    destroy,
    replaceRecommendation(nextRecommendation: DraftRecommendation) {
      recommendation = nextRecommendation;
      onRecommendationCommitted?.();
    },
  };
}

export type { ActivateDraftInput, ActivateDraftResult, DraftSessionDependencies };

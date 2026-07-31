<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import TopBar from "./lib/components/TopBar.svelte";
  import SetupChecklist from "./lib/components/SetupChecklist.svelte";
  import ModeTabs from "./lib/components/ModeTabs.svelte";
  import ConnectPanel from "./lib/components/ConnectPanel.svelte";
  import RankingsImportPanel from "./lib/components/RankingsImportPanel.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import DraftSummaryStrip from "./lib/components/DraftSummaryStrip.svelte";
  import DraftRoomPanel from "./lib/components/DraftRoomPanel.svelte";
  import RecommendationPanel from "./lib/components/RecommendationPanel.svelte";
  import RosterPanel from "./lib/components/RosterPanel.svelte";
  import MyTeamPanel from "./lib/components/MyTeamPanel.svelte";
  import TeamAskPanel from "./lib/components/TeamAskPanel.svelte";
  import TeamActivityPanel from "./lib/components/TeamActivityPanel.svelte";
  import TeamNeedsPanel from "./lib/components/TeamNeedsPanel.svelte";
  import TeamDataReadinessPanel from "./lib/components/TeamDataReadinessPanel.svelte";
  import TeamLineupPanel from "./lib/components/TeamLineupPanel.svelte";
  import TeamWeekPanel from "./lib/components/TeamWeekPanel.svelte";
  import TeamWaiverPanel from "./lib/components/TeamWaiverPanel.svelte";
  import RosRankingsImportPanel from "./lib/components/RosRankingsImportPanel.svelte";
  import WeeklyProjectionsImportPanel from "./lib/components/WeeklyProjectionsImportPanel.svelte";
  import TeamRefreshStatus from "./lib/components/TeamRefreshStatus.svelte";
  import DraftSyncStatus from "./lib/components/DraftSyncStatus.svelte";
  import FormatCompatibilityNotice from "./lib/components/FormatCompatibilityNotice.svelte";
  import PickFeedPanel from "./lib/components/PickFeedPanel.svelte";
  import AskManagerPanel from "./lib/components/AskManagerPanel.svelte";
  import DraftPreparationHeader from "./lib/components/DraftPreparationHeader.svelte";
  import DraftAiSetupPanel from "./lib/components/DraftAiSetupPanel.svelte";
  import DraftDataStatus from "./lib/components/DraftDataStatus.svelte";

  import {
    askManagerRequest,
    askTeamManagerRequest,
    clearAdpRequest,
    clearRosRankingsRequest,
    clearSeasonProjectionsRequest,
    clearWeeklyProjectionsRequest,
    clearRankingsRequest,
    createDraftEventSource,
    fetchAiStatus,
    fetchDraftRecommendationRequest,
    fetchDecisionHistory,
    fetchAiDraftStrategyRequest,
    fetchDraftState,
    fetchDiagnostics,
    fetchSettings,
    fetchSleeperConnect,
    fetchTeamManagerState,
    importWeeklyProjectionFilesRequest,
    importAdpRequest,
    importRankingsRequest,
    importRosRankingsRequest,
    importSeasonProjectionsRequest,
    updateSettings,
  } from "./lib/api";
  import { draftTeamReference, getDraftPhase, getUserTeam, isMockDraft, picksUntilUserTurn, preferredWorkspaceMode } from "./lib/format";
  import {
    shouldRefreshTeamManager,
    TEAM_REFRESH_INTERVAL_MS,
    teamPayloadFingerprint,
  } from "./lib/team-refresh";
  import { buildCandidateDiscussionQuestion, shouldRequestAiDraftStrategy } from "./lib/ai-panel";
  import { getImportFreshness } from "./lib/freshness";
  import { shouldOpenDraftPreparation } from "./lib/draft-preparation";
  import type { WorkspaceMode } from "./lib/format";
  import type {
    ConnectDraft,
    ConnectLeague,
    AiProviderStatus,
    AppSettings,
    ConnectPayload,
    DraftPayload,
    DraftRecommendation,
    DraftScoringFormat,
    DraftState,
    DecisionSnapshot,
    AiDraftStrategyPayload,
    AdpImportSummary,
    RankingImportSummary,
    RosRankingImportSummary,
    SeasonProjectionImportSummary,
    TeamActivitySummary,
    TeamDataReadiness,
    TeamLineupSummary,
    TeamManagerState,
    TeamNeedsSummary,
    TeamWaiverSummary,
    TeamWeekContext,
    TeamPayload,
    Position,
    WeeklyProjectionImportSummary,
    ReadinessItem,
    AiConversationMessage,
    PlayerPreferenceLevel,
    PlayerPreferenceSummary,
    PlayerPreferences,
    RecommendationPreferenceRequest,
  } from "./lib/types";
  let draftState: DraftState | null = $state(null);
  let recommendation: DraftRecommendation | null = $state(null);
  let status = $state("Connect Sleeper");
  let lastEvent = $state("Enter a username or paste a league URL to begin");
  let usernameInput = $state("");
  let seasonInput = $state("");
  let leagueInput = $state("");
  let draftInput = $state("");
  let userRosterIdInput = $state("");
  let connectPayload: ConnectPayload | null = $state(null);
  let selectedLeagueId = $state("");
  let selectedDraftId = $state("");
  let activeDraftId = $state("");
  let activeDraftTeamRef: string | null = $state(null);
  let activeUserRosterId: string | null = $state(null);
  let loadError = $state("");
  let rankingImportSummary: RankingImportSummary | null = $state(null);
  let seasonProjectionImportSummary: SeasonProjectionImportSummary | null = $state(null);
  let adpImportSummary: AdpImportSummary | null = $state(null);
  let teamManagerState: TeamManagerState | null = $state(null);
  let teamDataReadiness: TeamDataReadiness | null = $state(null);
  let teamNeeds: TeamNeedsSummary | null = $state(null);
  let teamLineupSummary: TeamLineupSummary | null = $state(null);
  let teamWeekContext: TeamWeekContext | null = $state(null);
  let teamWaiverSummary: TeamWaiverSummary | null = $state(null);
  let teamActivitySummary: TeamActivitySummary | null = $state(null);
  let weeklyProjectionSummary: WeeklyProjectionImportSummary | null = $state(null);
  let rosRankingSummary: RosRankingImportSummary | null = $state(null);
  let teamProjectionSeason = $state("");
  let teamProjectionWeek = $state(0);
  let weeklyProjectionError = $state("");
  let rosRankingError = $state("");
  let isImportingWeeklyProjections = $state(false);
  let isClearingWeeklyProjections = $state(false);
  let isImportingRosRankings = $state(false);
  let isClearingRosRankings = $state(false);
  let teamManagerError = $state("");
  let isLoadingTeamManager = $state(false);
  let isRefreshingTeamManager = $state(false);
  let teamRefreshError = $state("");
  let teamLastCheckedAt: number | null = $state(null);
  let teamLastChangedAt: number | null = $state(null);
  let teamPayloadHash = "";
  let teamManagerRequestId = 0;
  let teamRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let playerPreferences: PlayerPreferences = $state({});
  let rankingImportError = $state("");
  let seasonProjectionImportError = $state("");
  let adpImportError = $state("");
  let isImportingRankings = $state(false);
  let isClearingRankings = $state(false);
  let isImportingSeasonProjections = $state(false);
  let isClearingSeasonProjections = $state(false);
  let isImportingAdp = $state(false);
  let isClearingAdp = $state(false);
  let isLoading = $state(false);
  let isConnecting = $state(false);
  let isSavingSettings = $state(false);
  let settingsOpen = $state(false);
  let appSettings: AppSettings | null = $state(null);
  let aiProviderStatus: AiProviderStatus | null = $state(null);
  let settingsError = $state("");
  let isCopyingDiagnostics = $state(false);
  let diagnosticsStatus = $state("");
  let eventSource: EventSource | null = null;
  let draftLastSuccessfulAt: number | null = $state(null);
  let draftConsecutiveFailures = $state(0);
  let draftNextRetryMs = $state(0);
  let draftReconnecting = $state(false);
  let decisionSnapshots: DecisionSnapshot[] = $state([]);
  let decisionHistoryError = $state("");
  let isLoadingDecisionHistory = $state(false);
  let decisionHistoryRequestId = 0;
  let draftQuestionRequest: { id: number; question: string } | null = $state(null);
  let draftQuestionRequestId = 0;

  function preferenceStorageKey(draftId: string): string {
    return `playerPreferences:${draftId}`;
  }

  function loadPlayerPreferences(draftId: string) {
    try {
      const raw = window.localStorage.getItem(preferenceStorageKey(draftId));
      playerPreferences = raw ? (JSON.parse(raw) as PlayerPreferences) : {};
    } catch {
      playerPreferences = {};
    }
  }

  function savePlayerPreferences(draftId: string, preferences: PlayerPreferences) {
    try {
      window.localStorage.setItem(preferenceStorageKey(draftId), JSON.stringify(preferences));
    } catch {
      // Local preferences are optional; ignore storage failures.
    }
  }

  function setPlayerPreference(playerId: string, preference: PlayerPreferenceLevel | null) {
    if (!activeDraftId) {
      return;
    }

    const nextPreferences = { ...playerPreferences };
    if (preference) {
      nextPreferences[playerId] = preference;
    } else {
      delete nextPreferences[playerId];
    }
    playerPreferences = nextPreferences;
    savePlayerPreferences(activeDraftId, nextPreferences);
    void refreshRecommendationWithPreferences(nextPreferences);
  }

  function clearPlayerPreferences() {
    if (!activeDraftId) {
      return;
    }
    playerPreferences = {};
    void refreshRecommendationWithPreferences({});
    try {
      window.localStorage.removeItem(preferenceStorageKey(activeDraftId));
    } catch {
      // Local preferences are optional; ignore storage failures.
    }
  }

  function playerPreferenceSummary(): PlayerPreferenceSummary {
    const playersById = new Map((draftState?.players ?? []).map((player) => [player.id, player.name]));
    const summary: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] };
    for (const [playerId, preference] of Object.entries(playerPreferences)) {
      const playerName = playersById.get(playerId) ?? playerId;
      if (preference === "pin") {
        summary.pinned.push(playerName);
      } else if (preference === "fade") {
        summary.faded.push(playerName);
      } else if (preference === "exclude") {
        summary.excluded.push(playerName);
      }
    }
    return summary;
  }

  function recommendationPreferenceRequest(preferences: PlayerPreferences = playerPreferences): RecommendationPreferenceRequest {
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

  function hasPlayerPreferences(preferences: PlayerPreferences = playerPreferences): boolean {
    return Object.keys(preferences).length > 0;
  }

  async function refreshRecommendationWithPreferences(preferences: PlayerPreferences = playerPreferences) {
    if (!activeDraftId || !draftState) {
      return;
    }

    try {
      recommendation = await fetchDraftRecommendationRequest(
        activeDraftId,
        activeDraftTeamRef,
        recommendationPreferenceRequest(preferences),
      );
      void loadDecisionHistory();
    } catch (error) {
      lastEvent = error instanceof Error ? `Preference refresh failed: ${error.message}` : "Preference refresh failed";
    }
  }

  function hasStoredDraft(): boolean {
    try {
      const lastDraftId = window.localStorage.getItem("lastDraftId");
      return Boolean(lastDraftId && !isMockDraft(lastDraftId));
    } catch {
      return false;
    }
  }

  let connectExpanded = $state(!hasStoredDraft());
  let draftPreparationOpen = $state(false);
  let limitedDataMode = $state(false);
  let workspaceMode: WorkspaceMode = $state("draft");
  let userPickedMode = $state(false);
  let phaseSyncKey = $state("");

  function handleTeamRefreshFocus() {
    void refreshTeamManagerIfEligible();
  }

  function handleTeamRefreshVisibility() {
    if (document.visibilityState === "visible") {
      void refreshTeamManagerIfEligible();
    }
  }

  onMount(async () => {
    window.addEventListener("focus", handleTeamRefreshFocus);
    document.addEventListener("visibilitychange", handleTeamRefreshVisibility);
    teamRefreshInterval = setInterval(() => {
      void refreshTeamManagerIfEligible();
    }, TEAM_REFRESH_INTERVAL_MS);

    await loadSettings();
    usernameInput = window.localStorage.getItem("sleeperUsername") ?? "";
    seasonInput = window.localStorage.getItem("sleeperSeason") ?? "";
    leagueInput = window.localStorage.getItem("sleeperLeagueInput") ?? "";
    const lastDraftId = window.localStorage.getItem("lastDraftId") ?? "";
    const lastDraftTeamRef = window.localStorage.getItem("lastDraftTeamRef");
    const lastUserRosterId = window.localStorage.getItem("lastUserRosterId");
    const lastLeagueId = window.localStorage.getItem("lastLeagueId") ?? "";
    if (lastDraftId && !isMockDraft(lastDraftId)) {
      await loadDraft(lastDraftId, lastDraftTeamRef ?? lastUserRosterId, lastLeagueId, lastUserRosterId);
    } else if (lastDraftId && isMockDraft(lastDraftId)) {
      window.localStorage.removeItem("lastDraftId");
      window.localStorage.removeItem("lastDraftTeamRef");
      window.localStorage.removeItem("lastUserRosterId");
      window.localStorage.removeItem("lastLeagueId");
    }
  });

  onDestroy(() => {
    eventSource?.close();
    window.removeEventListener("focus", handleTeamRefreshFocus);
    document.removeEventListener("visibilitychange", handleTeamRefreshVisibility);
    if (teamRefreshInterval) {
      clearInterval(teamRefreshInterval);
    }
  });

  async function loadSettings() {
    settingsError = "";
    try {
      const [settings, status] = await Promise.all([fetchSettings(), fetchAiStatus()]);
      appSettings = settings;
      aiProviderStatus = status;
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not load settings.";
    }
  }

  async function saveSettings(settings: AppSettings): Promise<boolean> {
    isSavingSettings = true;
    settingsError = "";
    try {
      appSettings = await updateSettings(settings);
      aiProviderStatus = await fetchAiStatus();
      return true;
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not save settings.";
      return false;
    } finally {
      isSavingSettings = false;
    }
  }

  async function copyTextToClipboard(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Clipboard write timed out.")), 1500)),
        ]);
        return;
      }
    } catch {
      // Fall through to the textarea copy path below.
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("Clipboard copy is not available in this browser.");
    }
  }

  async function copyDiagnostics() {
    isCopyingDiagnostics = true;
    diagnosticsStatus = "";
    try {
      const diagnostics = await fetchDiagnostics();
      await copyTextToClipboard(JSON.stringify(diagnostics, null, 2));
      diagnosticsStatus = "Diagnostics copied. It excludes local auth tokens.";
    } catch (error) {
      diagnosticsStatus = error instanceof Error ? error.message : "Could not copy diagnostics.";
    } finally {
      isCopyingDiagnostics = false;
    }
  }

  function resetRendererData() {
    try {
      const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => Boolean(key))
        .filter((key) =>
          key.startsWith("playerPreferences:") ||
          ["lastDraftId", "lastUserRosterId", "lastLeagueId", "sleeperUsername", "sleeperSeason", "sleeperLeagueInput"].includes(key),
        );
      for (const key of keys) {
        window.localStorage.removeItem(key);
      }
    } finally {
      window.location.reload();
    }
  }

  async function findSleeperLeagues() {
    const username = usernameInput.trim();
    if (!username) {
      loadError = "Enter a Sleeper username or user ID.";
      return;
    }

    eventSource?.close();
    if (isDemoDraftActive) {
      clearActiveDraft();
    }
    isConnecting = true;
    loadError = "";
    status = "Finding Sleeper leagues";
    lastEvent = "Looking up account";

    try {
      const payload = await fetchSleeperConnect({
        username,
        season: seasonInput.trim() || undefined,
        leagueId: leagueInput.trim() || undefined,
      });
      connectPayload = payload;
      window.localStorage.setItem("sleeperUsername", username);
      window.localStorage.setItem("sleeperSeason", seasonInput.trim());
      window.localStorage.setItem("sleeperLeagueInput", leagueInput.trim());

      const firstLeague = payload.leagues[0] ?? null;
      selectedLeagueId = firstLeague?.leagueId ?? "";
      selectedDraftId = firstLeague?.recommendedDraftId ?? firstLeague?.drafts[0]?.draftId ?? "";
      status = payload.leagues.length > 0 ? "Choose a Sleeper league" : "No Sleeper leagues found";
      lastEvent = `Loaded ${payload.season} leagues for ${payload.user.displayName ?? payload.user.username ?? payload.user.userId}`;
    } catch (error) {
      connectPayload = null;
      selectedLeagueId = "";
      selectedDraftId = "";
      loadError = error instanceof Error ? error.message : "Sleeper lookup failed.";
      status = "Sleeper lookup unavailable";
    } finally {
      isConnecting = false;
    }
  }

  function selectLeague(league: ConnectLeague) {
    selectedLeagueId = league.leagueId;
    selectedDraftId = league.recommendedDraftId ?? league.drafts[0]?.draftId ?? "";
    loadError = "";
  }

  function selectDraft(draft: ConnectDraft) {
    selectedDraftId = draft.draftId;
    loadError = "";
  }

  async function openSelectedDraft() {
    if (!selectedLeague || !selectedDraft) {
      loadError = "Choose a league and draft first.";
      return;
    }

    const draftTeamRef = draftTeamReference(selectedDraft, selectedLeague.userRosterId);
    await loadDraft(selectedDraft.draftId, draftTeamRef, selectedLeague.leagueId, selectedLeague.userRosterId);
  }

  async function connectSleeperDraft() {
    const draftId = draftInput.trim();
    if (!draftId) {
      loadError = "Enter a Sleeper draft ID to load a real draft.";
      return;
    }

    const explicitRosterId = userRosterIdInput.trim() || null;
    await loadDraft(
      draftId,
      explicitRosterId,
      "",
      explicitRosterId,
      connectPayload?.user.userId ?? (usernameInput.trim() || null),
    );
  }

  async function loadMockDraft() {
    draftInput = "";
    userRosterIdInput = "";
    await loadDraft("mock-draft", null, "");
  }

  function clearActiveDraft() {
    eventSource?.close();
    resetTeamRefreshTracking();
    draftState = null;
    recommendation = null;
    rankingImportSummary = null;
    seasonProjectionImportSummary = null;
    adpImportSummary = null;
    activeDraftId = "";
    activeDraftTeamRef = null;
    activeUserRosterId = null;
    teamManagerState = null;
    teamDataReadiness = null;
    teamNeeds = null;
    teamLineupSummary = null;
    teamWeekContext = null;
    teamWaiverSummary = null;
    teamActivitySummary = null;
    weeklyProjectionSummary = null;
    rosRankingSummary = null;
    teamProjectionSeason = "";
    teamProjectionWeek = 0;
    weeklyProjectionError = "";
    rosRankingError = "";
    seasonProjectionImportError = "";
    adpImportError = "";
    teamManagerError = "";
    connectExpanded = true;
    draftPreparationOpen = false;
    limitedDataMode = false;
    workspaceMode = "draft";
    userPickedMode = false;
    phaseSyncKey = "";
    window.localStorage.removeItem("lastDraftId");
    window.localStorage.removeItem("lastDraftTeamRef");
    window.localStorage.removeItem("lastUserRosterId");
    window.localStorage.removeItem("lastLeagueId");
  }

  async function loadDraft(
    draftId: string,
    draftTeamRef: string | null,
    leagueId = "",
    userRosterId: string | null = draftTeamRef,
    userIdentifier: string | null = null,
  ) {
    eventSource?.close();
    resetDraftSyncTracking();
    isLoading = true;
    loadError = "";
    status = isMockDraft(draftId) ? "Loading demo draft" : "Loading Sleeper draft";
    lastEvent = "Waiting for event stream";

    try {
      const payload = await fetchDraftState(draftId, draftTeamRef, userIdentifier);
      const resolvedDraftTeamRef = draftTeamRef
        ?? `slot-${payload.state.teams.find((team) => team.id === payload.state.userTeamId)?.draftSlot ?? 1}`;
      const resolvedLeagueId = leagueId || payload.state.leagueId || "";
      if (teamManagerState?.league.id !== resolvedLeagueId) {
        resetTeamRefreshTracking();
        teamProjectionSeason = "";
        teamProjectionWeek = 0;
        weeklyProjectionSummary = null;
        rosRankingSummary = null;
        weeklyProjectionError = "";
        rosRankingError = "";
      }
      applyDraftPayload(payload);
      activeDraftId = draftId;
      activeDraftTeamRef = resolvedDraftTeamRef;
      activeUserRosterId = userRosterId;
      void loadDecisionHistory();
      void loadTeamManager(resolvedLeagueId, userRosterId);
      loadPlayerPreferences(draftId);
      if (hasPlayerPreferences()) {
        void refreshRecommendationWithPreferences();
      }
      connectExpanded = false;
      draftPreparationOpen = shouldOpenDraftPreparation(
        draftId,
        payload.state.status,
        payload.rankingImportSummary?.appliedAt ?? null,
        Boolean(
          appSettings?.aiSetupAcknowledged
          || (aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured)
        ),
      );
      limitedDataMode = false;
      if (isMockDraft(draftId)) {
        window.localStorage.removeItem("lastDraftId");
        window.localStorage.removeItem("lastDraftTeamRef");
        window.localStorage.removeItem("lastUserRosterId");
        window.localStorage.removeItem("lastLeagueId");
      } else {
        window.localStorage.setItem("lastDraftId", draftId);
        if (resolvedDraftTeamRef) {
          window.localStorage.setItem("lastDraftTeamRef", resolvedDraftTeamRef);
        } else {
          window.localStorage.removeItem("lastDraftTeamRef");
        }
        if (userRosterId) {
          window.localStorage.setItem("lastUserRosterId", userRosterId);
        } else {
          window.localStorage.removeItem("lastUserRosterId");
        }
        if (resolvedLeagueId) {
          window.localStorage.setItem("lastLeagueId", resolvedLeagueId);
        } else {
          window.localStorage.removeItem("lastLeagueId");
        }
      }
      status = isMockDraft(draftId) ? "Demo draft loaded" : "Sleeper draft loaded";
      connectEvents(draftId, resolvedDraftTeamRef);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Draft load failed.";
      status = "Draft unavailable";
      draftState = null;
      recommendation = null;
      rankingImportSummary = null;
      seasonProjectionImportSummary = null;
      adpImportSummary = null;
      activeDraftId = "";
      activeDraftTeamRef = null;
      activeUserRosterId = null;
      decisionSnapshots = [];
      decisionHistoryError = "";
      teamManagerState = null;
      teamDataReadiness = null;
      teamNeeds = null;
      teamLineupSummary = null;
      teamWeekContext = null;
      teamWaiverSummary = null;
      teamActivitySummary = null;
      weeklyProjectionSummary = null;
      rosRankingSummary = null;
      teamProjectionSeason = "";
      teamProjectionWeek = 0;
      weeklyProjectionError = "";
      rosRankingError = "";
      seasonProjectionImportError = "";
      adpImportError = "";
      teamManagerError = "";
      resetTeamRefreshTracking();
      connectExpanded = true;
      draftPreparationOpen = false;
      limitedDataMode = false;
      workspaceMode = "draft";
      userPickedMode = false;
      phaseSyncKey = "";
      window.localStorage.removeItem("lastDraftId");
      window.localStorage.removeItem("lastDraftTeamRef");
      window.localStorage.removeItem("lastUserRosterId");
      window.localStorage.removeItem("lastLeagueId");
    } finally {
      isLoading = false;
    }
  }

  async function loadTeamManager(
    leagueId: string,
    userRosterId: string | null,
    projectionSeason: string | null = teamProjectionSeason || null,
    projectionWeek: number | null = teamProjectionWeek || null,
    background = false,
  ) {
    if (!leagueId || isMockDraft(activeDraftId)) {
      resetTeamRefreshTracking();
      teamManagerState = null;
      teamDataReadiness = null;
      teamNeeds = null;
      teamLineupSummary = null;
      teamWeekContext = null;
      teamWaiverSummary = null;
      teamActivitySummary = null;
      weeklyProjectionSummary = null;
      rosRankingSummary = null;
      weeklyProjectionError = "";
      rosRankingError = "";
      teamManagerError = "";
      isLoadingTeamManager = false;
      return;
    }

    const requestId = ++teamManagerRequestId;
    const isBackgroundRefresh = background && Boolean(teamManagerState);
    if (isBackgroundRefresh) {
      isRefreshingTeamManager = true;
    } else {
      isLoadingTeamManager = true;
      teamManagerError = "";
    }
    teamRefreshError = "";

    try {
      const payload = await fetchTeamManagerState(
        leagueId,
        userRosterId,
        activeDraftId,
        projectionSeason,
        projectionWeek,
      );
      if (requestId !== teamManagerRequestId) {
        return;
      }

      const nextPayloadHash = teamPayloadFingerprint(payload);
      const checkedAt = Date.now();
      const changed = teamPayloadHash === "" || nextPayloadHash !== teamPayloadHash;
      applyTeamPayload(payload);
      teamPayloadHash = nextPayloadHash;
      teamLastCheckedAt = checkedAt;
      if (changed) {
        teamLastChangedAt = checkedAt;
      }
      teamManagerError = "";
    } catch (error) {
      if (requestId !== teamManagerRequestId) {
        return;
      }

      const message = error instanceof Error ? error.message : "Could not load team roster.";
      if (isBackgroundRefresh) {
        teamRefreshError = message;
      } else {
        teamManagerState = null;
        teamDataReadiness = null;
        teamNeeds = null;
        teamLineupSummary = null;
        teamWeekContext = null;
        teamWaiverSummary = null;
        teamActivitySummary = null;
        weeklyProjectionSummary = null;
        rosRankingSummary = null;
        teamManagerError = message;
      }
    } finally {
      if (requestId === teamManagerRequestId) {
        isLoadingTeamManager = false;
        isRefreshingTeamManager = false;
      }
    }
  }

  async function refreshTeamManagerIfEligible(force = false) {
    const state = teamManagerState;
    if (!state || !shouldRefreshTeamManager({
      workspaceMode,
      manageAvailable,
      visibilityState: document.visibilityState,
      isRefreshing: isLoadingTeamManager || isRefreshingTeamManager,
      lastCheckedAt: teamLastCheckedAt,
      now: Date.now(),
      force,
    })) {
      return;
    }

    await loadTeamManager(
      state.league.id,
      activeUserRosterId,
      teamProjectionSeason || null,
      teamProjectionWeek || null,
      true,
    );
  }

  function resetTeamRefreshTracking() {
    teamManagerRequestId += 1;
    isLoadingTeamManager = false;
    isRefreshingTeamManager = false;
    teamRefreshError = "";
    teamLastCheckedAt = null;
    teamLastChangedAt = null;
    teamPayloadHash = "";
  }

  function applyTeamPayload(payload: TeamPayload) {
    teamManagerState = payload.state;
    teamDataReadiness = payload.dataReadiness;
    teamNeeds = payload.needs;
    teamLineupSummary = payload.lineupSummary;
    teamWeekContext = payload.weekContext;
    teamWaiverSummary = payload.waiverSummary;
    teamActivitySummary = payload.activitySummary;
    rosRankingSummary = payload.rosRankingSummary;
    weeklyProjectionSummary = payload.weeklyProjectionSummary;
    if (!teamProjectionSeason) {
      teamProjectionSeason = payload.state.league.season ?? "";
    }
    if (!teamProjectionWeek) {
      teamProjectionWeek = payload.state.week ?? 1;
    }
  }

  function applyDraftPayload(payload: DraftPayload) {
    draftState = payload.state;
    recommendation = payload.recommendation;
    rankingImportSummary = payload.rankingImportSummary;
    seasonProjectionImportSummary = payload.seasonProjectionImportSummary;
    adpImportSummary = payload.adpImportSummary;
    if (hasPlayerPreferences()) {
      void refreshRecommendationWithPreferences();
    }
    if (activeDraftId) {
      void loadDecisionHistory();
    }
  }

  async function loadDecisionHistory() {
    if (!activeDraftId) {
      decisionSnapshots = [];
      return;
    }

    const requestId = ++decisionHistoryRequestId;
    isLoadingDecisionHistory = decisionSnapshots.length === 0;
    decisionHistoryError = "";
    try {
      const payload = await fetchDecisionHistory(activeDraftId, activeDraftTeamRef);
      if (requestId === decisionHistoryRequestId) {
        decisionSnapshots = payload.snapshots;
      }
    } catch (error) {
      if (requestId === decisionHistoryRequestId) {
        decisionHistoryError = error instanceof Error ? error.message : "Could not load recommendation history.";
      }
    } finally {
      if (requestId === decisionHistoryRequestId) {
        isLoadingDecisionHistory = false;
      }
    }
  }

  function resetDraftSyncTracking() {
    draftLastSuccessfulAt = null;
    draftConsecutiveFailures = 0;
    draftNextRetryMs = 0;
    draftReconnecting = false;
  }

  function markDraftSyncSuccessful(at?: string) {
    const parsed = at ? new Date(at).getTime() : Date.now();
    draftLastSuccessfulAt = Number.isFinite(parsed) ? parsed : Date.now();
    draftConsecutiveFailures = 0;
    draftNextRetryMs = 0;
    draftReconnecting = false;
  }

  function formatPollTime(value: string | undefined): string {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function connectEvents(draftId: string, userRosterId: string | null) {
    eventSource?.close();
    eventSource = createDraftEventSource(draftId, userRosterId);

    eventSource.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as DraftPayload;
      applyDraftPayload(payload);
      lastEvent = "Snapshot received";
      status = isMockDraft(draftId) ? "Live mock stream connected" : "Sleeper polling connected";
      markDraftSyncSuccessful();
    });

    eventSource.addEventListener("pick", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as DraftPayload;
      applyDraftPayload(payload);
      lastEvent = `Pick ${payload.state.currentPick - 1} recorded`;
      status = isMockDraft(draftId) ? "Live mock stream connected" : "Sleeper polling connected";
      markDraftSyncSuccessful();
    });

    eventSource.addEventListener("heartbeat", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { at?: string };
      status = isMockDraft(draftId) ? "Live mock stream connected" : "Sleeper polling connected";
      markDraftSyncSuccessful(payload.at);
      lastEvent = isMockDraft(draftId)
        ? `Demo stream checked ${formatPollTime(payload.at)}`
        : `Sleeper checked ${formatPollTime(payload.at)}; no new picks`;
    });

    eventSource.addEventListener("stream-error", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        message?: string;
        consecutiveFailures?: number;
        nextRetryMs?: number;
      };
      const failures = payload.consecutiveFailures ?? 1;
      draftConsecutiveFailures = failures;
      draftNextRetryMs = payload.nextRetryMs ?? 0;
      draftReconnecting = false;
      status = failures >= 3 ? "Sleeper polling degraded" : "Sleeper polling retrying";
      lastEvent = payload.message ? `Poll failed (${failures}): ${payload.message}` : `Poll failed (${failures})`;
    });

    eventSource.onerror = () => {
      draftReconnecting = true;
      status = isMockDraft(draftId) ? "Event stream reconnecting" : "Sleeper polling reconnecting";
    };
  }

  async function importRankings(csvText: string) {
    if (!csvText) {
      rankingImportError = "Upload or paste a FantasyPros CSV first.";
      return;
    }

    isImportingRankings = true;
    rankingImportError = "";

    try {
      const payload = await importRankingsRequest(
        activeDraftId,
        activeDraftTeamRef,
        csvText,
        normalizeDraftScoring(draftState?.settings.scoring),
      );
      applyDraftPayload(payload);
      if (teamManagerState) {
        void loadTeamManager(teamManagerState.league.id, activeUserRosterId);
      }
      status = "FantasyPros rankings imported";
      lastEvent = `${payload.summary.matched} matched from ${payload.summary.rowsParsed} rows`;
    } catch (error) {
      rankingImportError = error instanceof Error ? error.message : "Ranking import failed.";
    } finally {
      isImportingRankings = false;
    }
  }

  async function clearRankings() {
    if (!activeDraftId) {
      rankingImportError = "Open a draft before clearing rankings.";
      return;
    }

    isClearingRankings = true;
    rankingImportError = "";

    try {
      const payload = await clearRankingsRequest(activeDraftId, activeDraftTeamRef);
      applyDraftPayload(payload);
      draftPreparationOpen = draftState?.status !== "complete";
      limitedDataMode = false;
      if (teamManagerState) {
        void loadTeamManager(teamManagerState.league.id, activeUserRosterId);
      }
      status = "FantasyPros rankings cleared";
      lastEvent = seasonProjectionImportSummary
        ? "Expert ranks cleared; season projections remain active"
        : "Recommendations returned to Sleeper placeholder values";
    } catch (error) {
      rankingImportError = error instanceof Error ? error.message : "Could not clear imported rankings.";
    } finally {
      isClearingRankings = false;
    }
  }

  async function importSeasonProjections(input: {
    season: string;
    files: Array<{ position: Position; csvText: string }>;
  }) {
    if (!activeDraftId || !input.season || input.files.length === 0) {
      seasonProjectionImportError = "Select a draft, season, and at least one projection CSV.";
      return;
    }
    isImportingSeasonProjections = true;
    seasonProjectionImportError = "";
    try {
      const payload = await importSeasonProjectionsRequest({
        draftId: activeDraftId,
        userRosterId: activeDraftTeamRef,
        season: input.season,
        files: input.files,
      });
      applyDraftPayload(payload);
      if (teamManagerState) {
        void loadTeamManager(teamManagerState.league.id, activeUserRosterId);
      }
      status = "FantasyPros season projections imported";
      lastEvent = `${payload.summary.matched} projection rows matched`;
    } catch (error) {
      seasonProjectionImportError = error instanceof Error ? error.message : "Season projection import failed.";
    } finally {
      isImportingSeasonProjections = false;
    }
  }

  async function clearSeasonProjections() {
    if (!activeDraftId) {
      return;
    }
    isClearingSeasonProjections = true;
    seasonProjectionImportError = "";
    try {
      applyDraftPayload(await clearSeasonProjectionsRequest(activeDraftId, activeDraftTeamRef));
      status = "Season projections cleared";
    } catch (error) {
      seasonProjectionImportError = error instanceof Error ? error.message : "Could not clear season projections.";
    } finally {
      isClearingSeasonProjections = false;
    }
  }

  async function importAdp(csvText: string, season: string) {
    if (!activeDraftId || !season || !csvText) {
      adpImportError = "Select a draft and upload the FantasyPros overall ADP CSV.";
      return;
    }
    isImportingAdp = true;
    adpImportError = "";
    try {
      const payload = await importAdpRequest({
        draftId: activeDraftId,
        userRosterId: activeDraftTeamRef,
        season,
        csvText,
      });
      applyDraftPayload(payload);
      status = "FantasyPros Sleeper ADP imported";
      lastEvent = `${payload.summary.matched} ADP rows matched`;
    } catch (error) {
      adpImportError = error instanceof Error ? error.message : "Sleeper ADP import failed.";
    } finally {
      isImportingAdp = false;
    }
  }

  async function clearAdp() {
    if (!activeDraftId) {
      return;
    }
    isClearingAdp = true;
    adpImportError = "";
    try {
      applyDraftPayload(await clearAdpRequest(activeDraftId, activeDraftTeamRef));
      status = "Sleeper ADP cleared";
    } catch (error) {
      adpImportError = error instanceof Error ? error.message : "Could not clear Sleeper ADP.";
    } finally {
      isClearingAdp = false;
    }
  }

  function normalizeDraftScoring(scoring: string | null | undefined): DraftScoringFormat {
    const normalized = scoring?.trim().toLowerCase();
    if (normalized === "ppr") return "PPR";
    if (normalized === "half ppr" || normalized === "half-ppr" || normalized === "half_ppr") return "Half PPR";
    if (normalized === "standard" || normalized === "std") return "Standard";
    return normalized ? "Custom" : "Unknown";
  }

  function openFantasyProsRankings() {
    const scoring = normalizeDraftScoring(draftState?.settings.scoring);
    const page = scoring === "PPR"
      ? "ppr-cheatsheets.php"
      : scoring === "Half PPR"
        ? "half-point-ppr-cheatsheets.php"
        : "consensus-cheatsheets.php";
    window.open(`https://www.fantasypros.com/nfl/rankings/${page}`, "_blank", "noopener,noreferrer");
  }

  function openFantasyProsSeasonProjections() {
    window.open("https://www.fantasypros.com/nfl/projections/qb.php?week=draft", "_blank", "noopener,noreferrer");
  }

  function openFantasyProsAdp() {
    window.open("https://www.fantasypros.com/nfl/adp/overall.php", "_blank", "noopener,noreferrer");
  }

  function openFantasyProsWeeklyProjections(position: Position, week: number) {
    const fantasyProsPosition = position === "DEF" ? "dst" : position.toLowerCase();
    const params = new URLSearchParams();
    if (week > 0) {
      params.set("week", String(week));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    window.open(`https://www.fantasypros.com/nfl/projections/${fantasyProsPosition}.php${suffix}`, "_blank", "noopener,noreferrer");
  }

  function openFantasyProsRosRankings() {
    const scoring = normalizeDraftScoring(teamManagerState?.league.scoring);
    const page = scoring === "PPR"
      ? "ros-ppr-overall.php"
      : scoring === "Half PPR"
        ? "ros-half-point-ppr-overall.php"
        : "ros-overall.php";
    window.open(`https://www.fantasypros.com/nfl/rankings/${page}`, "_blank", "noopener,noreferrer");
  }

  async function importRosRankings(input: {
    season: string;
    scoring: DraftScoringFormat;
    csvText: string;
  }) {
    if (!teamManagerState || !input.season || !input.csvText.trim()) {
      rosRankingError = "Open a team, enter the season, and choose the Overall ROS rankings CSV.";
      return;
    }
    isImportingRosRankings = true;
    rosRankingError = "";
    try {
      const payload = await importRosRankingsRequest({
        leagueId: teamManagerState.league.id,
        season: input.season,
        scoring: input.scoring,
        csvText: input.csvText,
        userRosterId: activeUserRosterId,
        draftId: activeDraftId,
        week: teamProjectionWeek || teamManagerState.week,
      });
      applyTeamPayload(payload);
      status = "FantasyPros rest-of-season rankings imported";
      lastEvent = `${payload.summary.matched} ROS ranking rows matched`;
    } catch (error) {
      rosRankingError = error instanceof Error ? error.message : "Rest-of-season ranking import failed.";
    } finally {
      isImportingRosRankings = false;
    }
  }

  async function clearRosRankings(input: { season: string; scoring: DraftScoringFormat }) {
    if (!teamManagerState) {
      return;
    }
    isClearingRosRankings = true;
    rosRankingError = "";
    try {
      await clearRosRankingsRequest(teamManagerState.league.id, input.season, input.scoring);
      await loadTeamManager(
        teamManagerState.league.id,
        activeUserRosterId,
        teamProjectionSeason || null,
        teamProjectionWeek || null,
      );
      status = "Rest-of-season rankings cleared";
    } catch (error) {
      rosRankingError = error instanceof Error ? error.message : "Could not clear rest-of-season rankings.";
    } finally {
      isClearingRosRankings = false;
    }
  }

  async function importWeeklyProjections(input: {
    files: Array<{ position: Position; csvText: string }>;
    season: string;
    week: number;
  }) {
    if (!teamManagerState) {
      weeklyProjectionError = "Open a Sleeper team before importing weekly projections.";
      return;
    }
    if (input.files.length === 0 || input.files.some((file) => !file.csvText.trim())) {
      weeklyProjectionError = "Upload or paste at least one FantasyPros weekly projections CSV.";
      return;
    }
    if (!input.season) {
      weeklyProjectionError = "Enter the season for this projection file.";
      return;
    }
    if (!Number.isInteger(input.week) || input.week < 1 || input.week > 22) {
      weeklyProjectionError = "Enter a valid NFL week from 1 to 22.";
      return;
    }

    isImportingWeeklyProjections = true;
    weeklyProjectionError = "";
    teamProjectionSeason = input.season;
    teamProjectionWeek = input.week;

    try {
      const payload = await importWeeklyProjectionFilesRequest({
        leagueId: teamManagerState.league.id,
        season: input.season,
        week: input.week,
        files: input.files,
        userRosterId: activeUserRosterId,
        draftId: activeDraftId,
      });
      applyTeamPayload(payload);
      status = "FantasyPros weekly projections imported";
      lastEvent = `${payload.summary.matched} matched across ${payload.summary.positions.length} position files for Week ${payload.summary.week}`;
    } catch (error) {
      weeklyProjectionError = error instanceof Error ? error.message : "Weekly projection import failed.";
    } finally {
      isImportingWeeklyProjections = false;
    }
  }

  async function loadWeeklyProjectionContext(input: { season: string; week: number }) {
    if (!teamManagerState) {
      weeklyProjectionError = "Open a Sleeper team before selecting a projection week.";
      return;
    }
    if (!input.season || !Number.isInteger(input.week) || input.week < 1 || input.week > 22) {
      weeklyProjectionError = "Enter a valid season and week.";
      return;
    }

    teamProjectionSeason = input.season;
    teamProjectionWeek = input.week;
    weeklyProjectionError = "";
    await loadTeamManager(teamManagerState.league.id, activeUserRosterId, input.season, input.week);
  }

  async function clearWeeklyProjections(input: { season: string; week: number }) {
    if (!teamManagerState) {
      weeklyProjectionError = "Open a Sleeper team before clearing weekly projections.";
      return;
    }
    if (!input.season || !Number.isInteger(input.week) || input.week < 1 || input.week > 22) {
      weeklyProjectionError = "Enter a valid season and week before clearing projections.";
      return;
    }

    isClearingWeeklyProjections = true;
    weeklyProjectionError = "";

    try {
      await clearWeeklyProjectionsRequest(teamManagerState.league.id, input.season, input.week);
      await loadTeamManager(teamManagerState.league.id, activeUserRosterId, input.season, input.week);
      status = "FantasyPros weekly projections cleared";
      lastEvent = `Cleared Week ${input.week} projection import`;
    } catch (error) {
      weeklyProjectionError = error instanceof Error ? error.message : "Could not clear weekly projections.";
    } finally {
      isClearingWeeklyProjections = false;
    }
  }

  async function askTeamManager(question: string, conversationHistory: AiConversationMessage[] = []): Promise<string> {
    if (!teamManagerState) {
      throw new Error("Open a Sleeper league before asking team questions.");
    }

    const payload = await askTeamManagerRequest(
      teamManagerState.league.id,
      activeUserRosterId,
      activeDraftId,
      question,
      conversationHistory,
      teamProjectionSeason || null,
      teamProjectionWeek || null,
    );
    applyTeamPayload(payload);
    return payload.answer;
  }
  async function askManager(question: string, conversationHistory: AiConversationMessage[] = []): Promise<string> {
    const payload = await askManagerRequest(
      activeDraftId,
      activeDraftTeamRef,
      question,
      conversationHistory,
      playerPreferenceSummary(),
      recommendationPreferenceRequest(),
    );
    recommendation = payload.recommendation;
    void loadDecisionHistory();
    return payload.answer;
  }

  function askAboutCandidate(playerName: string, recommendedPlayerName: string) {
    draftQuestionRequest = {
      id: ++draftQuestionRequestId,
      question: buildCandidateDiscussionQuestion(playerName, recommendedPlayerName),
    };
  }

  function enterDraftRoom() {
    const aiChoiceComplete = appSettings?.aiSetupAcknowledged
      || (aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured);
    if (!rankingImportSummary || !aiChoiceComplete) {
      return;
    }
    limitedDataMode = false;
    draftPreparationOpen = false;
  }

  async function enterDraftRoomWithFallback() {
    if (appSettings && !appSettings.aiSetupAcknowledged) {
      const saved = await saveSettings({
        ...appSettings,
        aiSetupAcknowledged: true,
      });
      if (!saved) {
        return;
      }
    }
    limitedDataMode = !rankingImportSummary;
    draftPreparationOpen = false;
  }

  function openDraftPreparation() {
    draftPreparationOpen = true;
  }

  function manageDraftDataFromSettings() {
    settingsOpen = false;
    workspaceMode = "draft";
    userPickedMode = true;
    draftPreparationOpen = true;
  }

  async function requestAiDraftStrategy(): Promise<AiDraftStrategyPayload> {
    const payload = await fetchAiDraftStrategyRequest(
      activeDraftId,
      activeDraftTeamRef,
      playerPreferenceSummary(),
      recommendationPreferenceRequest(),
    );
    void loadDecisionHistory();
    return payload;
  }

  const userTeam = $derived(getUserTeam(draftState));
  const picksUntilTurn = $derived(picksUntilUserTurn(draftState));
  const shouldRequestAiStrategy = $derived(
    shouldRequestAiDraftStrategy(draftState, aiProviderStatus, picksUntilTurn),
  );
  const aiDraftStrategyEnabled = $derived(
    shouldRequestAiDraftStrategy(draftState, aiProviderStatus, 0),
  );
  const activeSourceLabel = $derived(draftState ? (isMockDraft(activeDraftId) ? "Demo draft" : "Sleeper draft") : "No draft loaded");
  const isDemoDraftActive = $derived(Boolean(draftState && isMockDraft(activeDraftId)));
  const isRealDraftActive = $derived(Boolean(draftState && !isMockDraft(activeDraftId)));
  const hasImportedRankings = $derived(Boolean(rankingImportSummary));
  const rankingsStale = $derived.by(() => {
    const summary = rankingImportSummary as RankingImportSummary | null;
    return summary ? getImportFreshness(summary.appliedAt, 14).stale : false;
  });
  const hasSeasonProjections = $derived(Boolean(seasonProjectionImportSummary));
  const hasImportedAdp = $derived(Boolean(adpImportSummary));
  const draftDataSignalCount = $derived(
    Number(hasImportedRankings) + Number(hasSeasonProjections) + Number(hasImportedAdp),
  );
  const draftValuesIncomplete = $derived(isRealDraftActive && (!hasImportedRankings || rankingsStale));
  const selectedLeague = $derived.by(() => {
    const payload = connectPayload;
    return payload?.leagues.find((league) => league.leagueId === selectedLeagueId) ?? null;
  });
  const selectedDraft = $derived.by(() => {
    const league = selectedLeague;
    return league?.drafts.find((draft) => draft.draftId === selectedDraftId) ?? null;
  });

  const readinessItems: ReadinessItem[] = $derived.by(() => [
    {
      label: "Sleeper account",
      value: connectPayload || isRealDraftActive ? "Connected" : isDemoDraftActive ? "Demo mode" : "Not connected",
      detail: connectPayload
        ? `${connectPayload.user.displayName ?? connectPayload.user.username ?? connectPayload.user.userId} loaded`
        : isRealDraftActive
          ? "Live league data"
          : isDemoDraftActive
            ? "Sample board active"
            : "Enter your Sleeper username",
      tone: connectPayload || isRealDraftActive ? "ready" : isDemoDraftActive ? "neutral" : "blocked",
    },
    {
      label: "Draft room",
      value: draftState ? draftState.status.replace("_", " ") : selectedDraft ? "Selected" : "Not selected",
      detail: draftState ? draftState.name : selectedDraft ? selectedDraft.name : "Choose a league and draft",
      tone: draftState ? "ready" : selectedDraft ? "warning" : "blocked",
    },
    {
      label: "Your team",
      value: activeUserRosterId
        ? `Roster ${activeUserRosterId}`
        : activeDraftTeamRef?.startsWith("slot-")
          ? `Draft slot ${activeDraftTeamRef.replace("slot-", "")}`
        : selectedLeague?.userRosterId
          ? `Roster ${selectedLeague.userRosterId}`
          : draftState
            ? "Unmatched"
            : "Pending",
      detail: userTeam
        ? userTeam.name
        : selectedLeague?.userRosterId
          ? "Matched from Sleeper rosters"
          : draftState
            ? "Recommendations may miss roster needs"
            : "Matched after draft selection",
      tone: activeUserRosterId || activeDraftTeamRef || selectedLeague?.userRosterId ? "ready" : isRealDraftActive ? "warning" : "neutral",
    },
    {
      label: "Player values",
      value: rankingsStale
        ? "Needs refresh"
        : draftDataSignalCount === 3
          ? "Complete"
          : draftState
            ? `${draftDataSignalCount}/3 sources`
            : "Pending",
      detail: rankingsStale
        ? "Imported ECR is old; review a current export before drafting"
        : draftDataSignalCount === 3
        ? "ECR, season projections, and Sleeper ADP loaded"
        : hasImportedRankings
          ? "Add season projections and Sleeper ADP for full-quality advice"
        : isRealDraftActive
          ? "FantasyPros CSV required for real advice"
          : isDemoDraftActive
            ? "Demo projections active"
            : "Available after draft selection",
      tone: !rankingsStale && (draftDataSignalCount === 3 || isDemoDraftActive)
        ? "ready"
        : isRealDraftActive
          ? "warning"
          : "neutral",
    },
    {
      label: "AI manager",
      value: aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured
        ? "Codex"
        : appSettings?.aiSetupAcknowledged
          ? "No AI"
          : "Choose",
      detail: aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured
        ? "Local app-server selected"
        : appSettings?.aiSetupAcknowledged
          ? "Draft tracking remains available without recommendations"
          : "Select Codex or explicitly continue without AI",
      tone: aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured
        ? "ready"
        : appSettings?.aiSetupAcknowledged
          ? "neutral"
          : isRealDraftActive
            ? "warning"
            : "neutral",
    },
  ]);
  const manageAvailable = $derived(Boolean(teamManagerState) && isRealDraftActive);
  const showSetupChecklist = $derived(
    !draftState || connectExpanded || (draftPreparationOpen && workspaceMode === "draft"),
  );
  const draftDataSettingsStatus = $derived(
    rankingsStale
      ? "ECR needs refresh"
      : draftDataSignalCount === 3
        ? "3/3 sources ready"
        : `${draftDataSignalCount}/3 sources ready`,
  );
  const draftPhase = $derived(getDraftPhase(draftState));
  const weeklyProjectionDefaultSeason = $derived.by(() => {
    const state = teamManagerState as TeamManagerState | null;
    return teamProjectionSeason || state?.league.season || seasonInput.trim() || "";
  });
  const draftDataDefaultSeason = $derived.by(() => {
    return selectedDraft?.season
      || teamManagerState?.league.season
      || connectPayload?.season
      || seasonInput.trim()
      || String(new Date().getFullYear());
  });
  const weeklyProjectionDefaultWeek = $derived.by(() => {
    const state = teamManagerState as TeamManagerState | null;
    return teamProjectionWeek || state?.week || 1;
  });

  $effect(() => {
    const key = `${activeDraftId}:${draftPhase ?? ""}`;
    if (!draftState || !activeDraftId) {
      phaseSyncKey = "";
      return;
    }

    if (key !== phaseSyncKey) {
      phaseSyncKey = key;
      userPickedMode = false;
      workspaceMode = preferredWorkspaceMode(draftPhase, manageAvailable);
      return;
    }

    if (!userPickedMode && draftPhase === "complete" && manageAvailable && workspaceMode !== "manage") {
      workspaceMode = "manage";
    }
  });

  $effect(() => {
    if (!manageAvailable && workspaceMode === "manage") {
      workspaceMode = "draft";
    }
  });
</script>

<main class="app-shell">
  <TopBar
    title={draftState?.name ?? "Connect your Sleeper draft"}
    {status}
    {lastEvent}
    connected={Boolean(draftState)}
    showChangeDraft={Boolean(draftState)}
    connectEditorOpen={connectExpanded}
    onChangeDraft={() => (connectExpanded = !connectExpanded)}
    onOpenSettings={() => (settingsOpen = !settingsOpen)}
  />

  {#if settingsOpen}
    <SettingsPanel
      settings={appSettings}
      providerStatus={aiProviderStatus}
      isSaving={isSavingSettings}
      error={settingsError}
      {isCopyingDiagnostics}
      {diagnosticsStatus}
      onSave={saveSettings}
      onCopyDiagnostics={copyDiagnostics}
      onResetComplete={resetRendererData}
      draftDataAvailable={isRealDraftActive}
      draftDataStatus={draftDataSettingsStatus}
      onManageDraftData={manageDraftDataFromSettings}
    />
  {/if}

  {#if showSetupChecklist}
    <SetupChecklist items={readinessItems} />
  {/if}

  {#if connectExpanded}
    <div class="connect-editor">
      <ConnectPanel
        bind:usernameInput
        bind:seasonInput
        bind:leagueInput
        bind:draftInput
        bind:userRosterIdInput
        {connectPayload}
        {selectedLeagueId}
        {selectedDraftId}
        {isConnecting}
        {isLoading}
        {loadError}
        {activeSourceLabel}
        {activeDraftId}
        activeUserRosterId={activeUserRosterId ?? activeDraftTeamRef}
        onFindLeagues={findSleeperLeagues}
        onSelectLeague={selectLeague}
        onSelectDraft={selectDraft}
        onOpenSelectedDraft={openSelectedDraft}
        onConnectSleeperDraft={connectSleeperDraft}
        onLoadMockDraft={loadMockDraft}
      />
    </div>
  {/if}

  {#if draftState}
    {#key activeDraftId}
      <ModeTabs
        bind:mode={workspaceMode}
        {manageAvailable}
        phase={draftPhase}
        onUserSelect={() => {
          userPickedMode = true;
        }}
      />
      {#if draftPreparationOpen && workspaceMode === "draft"}
        <FormatCompatibilityNotice compatibility={draftState.settings.formatCompatibility} />
        <div class="preparation-flow">
          <DraftPreparationHeader
            draftName={draftState.name}
            scoring={normalizeDraftScoring(draftState.settings.scoring)}
            season={draftDataDefaultSeason}
            hasRankings={hasImportedRankings}
            {rankingsStale}
            hasProjections={hasSeasonProjections}
            hasAdp={hasImportedAdp}
            aiConfigured={aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured}
            aiAcknowledged={Boolean(
              appSettings?.aiSetupAcknowledged
              || (aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured)
            )}
            liveDraft={draftPhase === "drafting"}
            onContinue={enterDraftRoom}
            onContinueFallback={() => {
              void enterDraftRoomWithFallback();
            }}
          />
          <RankingsImportPanel
            hasDraft={true}
            scoring={normalizeDraftScoring(draftState.settings.scoring)}
            season={draftDataDefaultSeason}
            {isImportingRankings}
            {isClearingRankings}
            {isImportingSeasonProjections}
            {isClearingSeasonProjections}
            {isImportingAdp}
            {isClearingAdp}
            {rankingImportSummary}
            {seasonProjectionImportSummary}
            {adpImportSummary}
            {rankingImportError}
            {seasonProjectionImportError}
            {adpImportError}
            onImportRankings={importRankings}
            onImportSeasonProjections={importSeasonProjections}
            onImportAdp={importAdp}
            onClearRankings={clearRankings}
            onClearSeasonProjections={clearSeasonProjections}
            onClearAdp={clearAdp}
            onOpenRankings={openFantasyProsRankings}
            onOpenSeasonProjections={openFantasyProsSeasonProjections}
            onOpenAdp={openFantasyProsAdp}
            expanded={true}
          />
          <DraftAiSetupPanel
            settings={appSettings}
            providerStatus={aiProviderStatus}
            isSaving={isSavingSettings}
            error={settingsError}
            onSave={saveSettings}
          />
        </div>
      {:else}
      <DraftSummaryStrip state={draftState} />
      {#if workspaceMode === "draft"}
        <DraftSyncStatus
          lastSuccessfulAt={draftLastSuccessfulAt}
          consecutiveFailures={draftConsecutiveFailures}
          nextRetryMs={draftNextRetryMs}
          reconnecting={draftReconnecting}
          onReconnect={() => connectEvents(activeDraftId, activeDraftTeamRef)}
        />
      {/if}
      <FormatCompatibilityNotice
        compatibility={workspaceMode === "manage"
          ? teamManagerState?.league.formatCompatibility
          : draftState.settings.formatCompatibility}
      />

      {#if workspaceMode === "draft"}
        <DraftRoomPanel state={draftState} />
        <section class="dashboard-grid draft-grid">
          <div class="primary-column">
            {#if draftPhase === "complete"}
              <article class="panel phase-note">
                <h2>Draft is over</h2>
                <p>The completed board and roster stay here for review. Switch to Season for lineups, waivers, and weekly decisions.</p>
                {#if manageAvailable}
                  <button
                    class="btn btn-primary"
                    type="button"
                    onclick={() => {
                      userPickedMode = true;
                      workspaceMode = "manage";
                    }}
                  >
                    Open season manager
                  </button>
                {/if}
              </article>
            {/if}
            {#if draftPhase !== "complete"}
              <RecommendationPanel
                currentPick={draftState.currentPick}
                aiEnabled={aiProviderStatus?.id === "codex-app-server" && aiProviderStatus.configured}
                aiStrategyEnabled={aiDraftStrategyEnabled}
                shouldRequestAiStrategy={shouldRequestAiStrategy}
                strategyRequestKey={JSON.stringify(playerPreferences)}
                strategyHistory={decisionSnapshots.filter((snapshot) => snapshot.trigger === "ai-strategy")}
                isLoadingStrategyHistory={isLoadingDecisionHistory}
                strategyHistoryError={decisionHistoryError}
                onRequestAiStrategy={requestAiDraftStrategy}
                onAskAboutCandidate={askAboutCandidate}
                playerPreferences={playerPreferences}
                showPlaceholderWarning={draftValuesIncomplete}
                onSetPreference={setPlayerPreference}
                onClearPreferences={clearPlayerPreferences}
                onOpenRankings={openDraftPreparation}
                onOpenSettings={() => (settingsOpen = true)}
              />
              <AskManagerPanel
                onAsk={askManager}
                promptRequest={draftQuestionRequest}
                onOpenSettings={() => (settingsOpen = true)}
                providerStatus={aiProviderStatus}
                {hasImportedRankings}
                showPlaceholderWarning={draftValuesIncomplete}
                {draftState}
                {recommendation}
              />
            {:else}
              <RosterPanel state={draftState} />
              <PickFeedPanel state={draftState} />
            {/if}
          </div>
          <div class="side-column">
            {#if draftValuesIncomplete || limitedDataMode}
              <DraftDataStatus
                hasRankings={hasImportedRankings}
                {rankingsStale}
                hasProjections={hasSeasonProjections}
                hasAdp={hasImportedAdp}
                limitedMode={limitedDataMode}
                onOpen={openDraftPreparation}
              />
            {/if}
            {#if draftPhase !== "complete" && (userTeam?.roster.length ?? 0) > 0}
              <RosterPanel state={draftState} />
            {/if}
          </div>
        </section>
      {:else}
        <TeamRefreshStatus
          lastCheckedAt={teamLastCheckedAt}
          lastChangedAt={teamLastChangedAt}
          isRefreshing={isRefreshingTeamManager}
          error={teamRefreshError}
          onRefresh={() => refreshTeamManagerIfEligible(true)}
        />
        <section class="dashboard-grid manage-grid">
          <div class="primary-column">
            <MyTeamPanel state={teamManagerState} error={teamManagerError} isLoading={isLoadingTeamManager} />
            <TeamNeedsPanel needs={teamNeeds} />
            <TeamLineupPanel lineupSummary={teamLineupSummary} isLoading={isLoadingTeamManager} onAsk={(question) => { void askTeamManager(question); }} />
            <TeamAskPanel teamState={teamManagerState} teamNeeds={teamNeeds} lineupSummary={teamLineupSummary} weekContext={teamWeekContext} waiverSummary={teamWaiverSummary} activitySummary={teamActivitySummary} onAsk={askTeamManager} providerStatus={aiProviderStatus} />
          </div>
          <div class="side-column">
            <TeamDataReadinessPanel readiness={teamDataReadiness} isLoading={isLoadingTeamManager} />
            <TeamWeekPanel weekContext={teamWeekContext} isLoading={isLoadingTeamManager} />
            <RosRankingsImportPanel
              hasTeam={Boolean(teamManagerState)}
              defaultSeason={weeklyProjectionDefaultSeason}
              leagueSeason={teamManagerState?.league.season ?? ""}
              scoring={normalizeDraftScoring(teamManagerState?.league.scoring)}
              summary={rosRankingSummary}
              weeklyLoaded={Boolean(weeklyProjectionSummary)}
              error={rosRankingError}
              isImporting={isImportingRosRankings}
              isClearing={isClearingRosRankings}
              onImport={importRosRankings}
              onClear={clearRosRankings}
              onOpenFantasyPros={openFantasyProsRosRankings}
            />
            <WeeklyProjectionsImportPanel
              hasTeam={Boolean(teamManagerState)}
              defaultSeason={weeklyProjectionDefaultSeason}
              defaultWeek={weeklyProjectionDefaultWeek}
              leagueSeason={teamManagerState?.league.season ?? ""}
              currentWeek={teamManagerState?.week ?? 0}
              summary={weeklyProjectionSummary}
              rosLoaded={Boolean(rosRankingSummary)}
              error={weeklyProjectionError}
              isImporting={isImportingWeeklyProjections}
              isClearing={isClearingWeeklyProjections}
              onImport={importWeeklyProjections}
              onLoadContext={loadWeeklyProjectionContext}
              onClear={clearWeeklyProjections}
              onOpenFantasyPros={openFantasyProsWeeklyProjections}
            />
            <TeamWaiverPanel waiverSummary={teamWaiverSummary} isLoading={isLoadingTeamManager} onAsk={(question) => { void askTeamManager(question); }} />
            <TeamActivityPanel activitySummary={teamActivitySummary} isLoading={isLoadingTeamManager} onAsk={(question) => { void askTeamManager(question); }} />
          </div>
        </section>
      {/if}
      {/if}
    {/key}
  {/if}
</main>

<style>
  .app-shell {
    width: min(1440px, 100%);
    margin: 0 auto;
    padding: var(--space-6);
    display: grid;
    gap: 0;
  }

  .app-shell > *,
  .primary-column,
  .side-column {
    min-width: 0;
  }

  .connect-editor {
    margin-bottom: var(--space-5);
  }

  .preparation-flow {
    display: grid;
    gap: var(--space-5);
    margin-top: var(--space-5);
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.75fr);
    align-items: start;
    gap: var(--space-5);
    margin-top: var(--space-5);
  }

  .primary-column,
  .side-column {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    align-content: start;
  }

  .phase-note {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
  }

  .phase-note h2 {
    font-size: var(--text-lg);
  }

  .phase-note p {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .phase-note .btn {
    justify-self: start;
  }

  @media (max-width: 920px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

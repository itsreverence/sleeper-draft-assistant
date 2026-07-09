<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import TopBar from "./lib/components/TopBar.svelte";
  import SetupChecklist from "./lib/components/SetupChecklist.svelte";
  import ModeTabs from "./lib/components/ModeTabs.svelte";
  import ConnectPanel from "./lib/components/ConnectPanel.svelte";
  import RankingsImportPanel from "./lib/components/RankingsImportPanel.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import DraftSummaryStrip from "./lib/components/DraftSummaryStrip.svelte";
  import RecommendationPanel from "./lib/components/RecommendationPanel.svelte";
  import TeamNeedsStrip from "./lib/components/TeamNeedsStrip.svelte";
  import RosterPanel from "./lib/components/RosterPanel.svelte";
  import MyTeamPanel from "./lib/components/MyTeamPanel.svelte";
  import TeamAskPanel from "./lib/components/TeamAskPanel.svelte";
  import TeamActivityPanel from "./lib/components/TeamActivityPanel.svelte";
  import TeamNeedsPanel from "./lib/components/TeamNeedsPanel.svelte";
  import TeamLineupPanel from "./lib/components/TeamLineupPanel.svelte";
  import TeamWeekPanel from "./lib/components/TeamWeekPanel.svelte";
  import TeamWaiverPanel from "./lib/components/TeamWaiverPanel.svelte";
  import PickFeedPanel from "./lib/components/PickFeedPanel.svelte";
  import AskManagerPanel from "./lib/components/AskManagerPanel.svelte";

  import {
    askManagerRequest,
    askTeamManagerRequest,
    clearRankingsRequest,
    createDraftEventSource,
    fetchAiStatus,
    fetchDraftRecommendationRequest,
    fetchDraftState,
    fetchExperimentalCodexStatus,
    fetchSettings,
    fetchSleeperConnect,
    fetchTeamManagerState,
    importRankingsRequest,
    logoutExperimentalCodex,
    pollExperimentalCodexLogin,
    startExperimentalCodexLogin,
    updateSettings,
  } from "./lib/api";
  import { draftSlotToRosterFallback, getDraftPhase, getUserTeam, isMockDraft, preferredWorkspaceMode } from "./lib/format";
  import type { WorkspaceMode } from "./lib/format";
  import type {
    ConnectDraft,
    ConnectLeague,
    AiProviderStatus,
    AppSettings,
    ConnectPayload,
    DraftPayload,
    ExperimentalCodexAuthStatus,
    DraftRecommendation,
    DraftState,
    RankingImportSummary,
    TeamActivitySummary,
    TeamLineupSummary,
    TeamManagerState,
    TeamNeedsSummary,
    TeamWaiverSummary,
    TeamWeekContext,
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
  let activeUserRosterId: string | null = $state(null);
  let loadError = $state("");
  let rankingImportSummary: RankingImportSummary | null = $state(null);
  let teamManagerState: TeamManagerState | null = $state(null);
  let teamNeeds: TeamNeedsSummary | null = $state(null);
  let teamLineupSummary: TeamLineupSummary | null = $state(null);
  let teamWeekContext: TeamWeekContext | null = $state(null);
  let teamWaiverSummary: TeamWaiverSummary | null = $state(null);
  let teamActivitySummary: TeamActivitySummary | null = $state(null);
  let teamManagerError = $state("");
  let isLoadingTeamManager = $state(false);
  let playerPreferences: PlayerPreferences = $state({});
  let rankingImportError = $state("");
  let isImportingRankings = $state(false);
  let isClearingRankings = $state(false);
  let isLoading = $state(false);
  let isConnecting = $state(false);
  let isSavingSettings = $state(false);
  let settingsOpen = $state(false);
  let appSettings: AppSettings | null = $state(null);
  let aiProviderStatus: AiProviderStatus | null = $state(null);
  let settingsError = $state("");
  let experimentalCodexAuthStatus: ExperimentalCodexAuthStatus | null = $state(null);
  let isStartingExperimentalCodexLogin = $state(false);
  let isPollingExperimentalCodexLogin = $state(false);
  let eventSource: EventSource | null = null;

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
        activeUserRosterId,
        recommendationPreferenceRequest(preferences),
      );
    } catch (error) {
      lastEvent = error instanceof Error ? `Preference refresh failed: ${error.message}` : "Preference refresh failed";
    }
  }

  function askWhatIf(playerName: string) {
    void askManager(`What if I draft ${playerName} with this pick? What should my next-round plan be?`, []);
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
  let rankingsExpanded = $state(false);
  let workspaceMode: WorkspaceMode = $state("draft");
  let userPickedMode = $state(false);
  let phaseSyncKey = $state("");

  onMount(async () => {
    await loadSettings();
    usernameInput = window.localStorage.getItem("sleeperUsername") ?? "";
    seasonInput = window.localStorage.getItem("sleeperSeason") ?? "";
    leagueInput = window.localStorage.getItem("sleeperLeagueInput") ?? "";
    const lastDraftId = window.localStorage.getItem("lastDraftId") ?? "";
    const lastUserRosterId = window.localStorage.getItem("lastUserRosterId");
    const lastLeagueId = window.localStorage.getItem("lastLeagueId") ?? "";
    if (lastDraftId && !isMockDraft(lastDraftId)) {
      await loadDraft(lastDraftId, lastUserRosterId, lastLeagueId);
    } else if (lastDraftId && isMockDraft(lastDraftId)) {
      window.localStorage.removeItem("lastDraftId");
      window.localStorage.removeItem("lastUserRosterId");
      window.localStorage.removeItem("lastLeagueId");
    }
  });

  onDestroy(() => {
    eventSource?.close();
  });

  async function loadSettings() {
    settingsError = "";
    try {
      const [settings, status, codexAuthStatus] = await Promise.all([
        fetchSettings(),
        fetchAiStatus(),
        fetchExperimentalCodexStatus(),
      ]);
      appSettings = settings;
      aiProviderStatus = status;
      experimentalCodexAuthStatus = codexAuthStatus;
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not load settings.";
    }
  }

  async function saveSettings(settings: AppSettings) {
    isSavingSettings = true;
    settingsError = "";
    try {
      appSettings = await updateSettings(settings);
      aiProviderStatus = await fetchAiStatus();
      experimentalCodexAuthStatus = await fetchExperimentalCodexStatus();
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not save settings.";
    } finally {
      isSavingSettings = false;
    }
  }

  async function startExperimentalCodexAuth() {
    isStartingExperimentalCodexLogin = true;
    settingsError = "";
    try {
      experimentalCodexAuthStatus = await startExperimentalCodexLogin();
      aiProviderStatus = await fetchAiStatus();
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not start Codex login.";
    } finally {
      isStartingExperimentalCodexLogin = false;
    }
  }

  async function pollExperimentalCodexAuth() {
    isPollingExperimentalCodexLogin = true;
    settingsError = "";
    try {
      experimentalCodexAuthStatus = await pollExperimentalCodexLogin(experimentalCodexAuthStatus ?? undefined);
      aiProviderStatus = await fetchAiStatus();
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not finish Codex login.";
    } finally {
      isPollingExperimentalCodexLogin = false;
    }
  }

  async function logoutExperimentalCodexAuth() {
    settingsError = "";
    try {
      experimentalCodexAuthStatus = await logoutExperimentalCodex();
      aiProviderStatus = await fetchAiStatus();
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not log out of Codex.";
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

    const userRosterId = selectedLeague.userRosterId ?? draftSlotToRosterFallback(selectedDraft);
    await loadDraft(selectedDraft.draftId, userRosterId, selectedLeague.leagueId);
  }

  async function connectSleeperDraft() {
    const draftId = draftInput.trim();
    if (!draftId) {
      loadError = "Enter a Sleeper draft ID to load a real draft.";
      return;
    }

    await loadDraft(draftId, userRosterIdInput.trim() || null, "");
  }

  async function loadMockDraft() {
    draftInput = "";
    userRosterIdInput = "";
    await loadDraft("mock-draft", null, "");
  }

  function clearActiveDraft() {
    eventSource?.close();
    draftState = null;
    recommendation = null;
    rankingImportSummary = null;
    activeDraftId = "";
    activeUserRosterId = null;
    teamManagerState = null;
    teamNeeds = null;
    teamLineupSummary = null;
    teamWeekContext = null;
    teamWaiverSummary = null;
    teamActivitySummary = null;
    teamManagerError = "";
    connectExpanded = true;
    rankingsExpanded = false;
    workspaceMode = "draft";
    userPickedMode = false;
    phaseSyncKey = "";
    window.localStorage.removeItem("lastDraftId");
    window.localStorage.removeItem("lastUserRosterId");
    window.localStorage.removeItem("lastLeagueId");
  }

  async function loadDraft(draftId: string, userRosterId: string | null, leagueId = "") {
    eventSource?.close();
    isLoading = true;
    loadError = "";
    status = isMockDraft(draftId) ? "Loading demo draft" : "Loading Sleeper draft";
    lastEvent = "Waiting for event stream";

    try {
      const payload = await fetchDraftState(draftId, userRosterId);
      applyDraftPayload(payload);
      activeDraftId = draftId;
      activeUserRosterId = userRosterId;
      void loadTeamManager(leagueId, userRosterId);
      loadPlayerPreferences(draftId);
      if (hasPlayerPreferences()) {
        void refreshRecommendationWithPreferences();
      }
      connectExpanded = false;
      rankingsExpanded = !isMockDraft(draftId) && !payload.rankingImportSummary;
      if (isMockDraft(draftId)) {
        window.localStorage.removeItem("lastDraftId");
        window.localStorage.removeItem("lastUserRosterId");
        window.localStorage.removeItem("lastLeagueId");
      } else {
        window.localStorage.setItem("lastDraftId", draftId);
        if (userRosterId) {
          window.localStorage.setItem("lastUserRosterId", userRosterId);
        } else {
          window.localStorage.removeItem("lastUserRosterId");
        }
        if (leagueId) {
          window.localStorage.setItem("lastLeagueId", leagueId);
        } else {
          window.localStorage.removeItem("lastLeagueId");
        }
      }
      status = isMockDraft(draftId) ? "Demo draft loaded" : "Sleeper draft loaded";
      connectEvents(draftId, userRosterId);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Draft load failed.";
      status = "Draft unavailable";
      draftState = null;
      recommendation = null;
      rankingImportSummary = null;
      activeDraftId = "";
      activeUserRosterId = null;
      teamManagerState = null;
      teamNeeds = null;
      teamLineupSummary = null;
      teamWeekContext = null;
      teamWaiverSummary = null;
      teamActivitySummary = null;
      teamManagerError = "";
      connectExpanded = true;
      rankingsExpanded = false;
      workspaceMode = "draft";
      userPickedMode = false;
      phaseSyncKey = "";
      window.localStorage.removeItem("lastDraftId");
      window.localStorage.removeItem("lastUserRosterId");
      window.localStorage.removeItem("lastLeagueId");
    } finally {
      isLoading = false;
    }
  }

  async function loadTeamManager(leagueId: string, userRosterId: string | null) {
    if (!leagueId || isMockDraft(activeDraftId)) {
      teamManagerState = null;
      teamNeeds = null;
      teamLineupSummary = null;
      teamWeekContext = null;
      teamWaiverSummary = null;
      teamActivitySummary = null;
      teamManagerError = "";
      isLoadingTeamManager = false;
      return;
    }

    isLoadingTeamManager = true;
    teamManagerError = "";
    try {
      const payload = await fetchTeamManagerState(leagueId, userRosterId, activeDraftId);
      teamManagerState = payload.state;
      teamNeeds = payload.needs;
      teamLineupSummary = payload.lineupSummary;
      teamWeekContext = payload.weekContext;
      teamWaiverSummary = payload.waiverSummary;
      teamActivitySummary = payload.activitySummary;
    } catch (error) {
      teamManagerState = null;
      teamNeeds = null;
      teamLineupSummary = null;
      teamWeekContext = null;
      teamWaiverSummary = null;
      teamActivitySummary = null;
      teamManagerError = error instanceof Error ? error.message : "Could not load team roster.";
    } finally {
      isLoadingTeamManager = false;
    }
  }
  function applyDraftPayload(payload: DraftPayload) {
    draftState = payload.state;
    recommendation = payload.recommendation;
    rankingImportSummary = payload.rankingImportSummary;
    if (hasPlayerPreferences()) {
      void refreshRecommendationWithPreferences();
    }
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
    });

    eventSource.addEventListener("pick", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as DraftPayload;
      applyDraftPayload(payload);
      lastEvent = `Pick ${payload.state.currentPick - 1} recorded`;
      status = isMockDraft(draftId) ? "Live mock stream connected" : "Sleeper polling connected";
    });

    eventSource.addEventListener("heartbeat", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { at?: string };
      status = isMockDraft(draftId) ? "Live mock stream connected" : "Sleeper polling connected";
      lastEvent = isMockDraft(draftId)
        ? `Demo stream checked ${formatPollTime(payload.at)}`
        : `Sleeper checked ${formatPollTime(payload.at)}; no new picks`;
    });

    eventSource.addEventListener("stream-error", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        message?: string;
        consecutiveFailures?: number;
      };
      const failures = payload.consecutiveFailures ?? 1;
      status = failures >= 3 ? "Sleeper polling degraded" : "Sleeper polling retrying";
      lastEvent = payload.message ? `Poll failed (${failures}): ${payload.message}` : `Poll failed (${failures})`;
    });

    eventSource.onerror = () => {
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
      const payload = await importRankingsRequest(activeDraftId, activeUserRosterId, csvText);
      rankingImportSummary = payload.summary;
      draftState = payload.state;
      recommendation = payload.recommendation;
      rankingsExpanded = false;
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
      const payload = await clearRankingsRequest(activeDraftId, activeUserRosterId);
      applyDraftPayload(payload);
      rankingsExpanded = true;
      if (teamManagerState) {
        void loadTeamManager(teamManagerState.league.id, activeUserRosterId);
      }
      status = "FantasyPros rankings cleared";
      lastEvent = "Recommendations returned to Sleeper placeholder values";
    } catch (error) {
      rankingImportError = error instanceof Error ? error.message : "Could not clear imported rankings.";
    } finally {
      isClearingRankings = false;
    }
  }

  function openFantasyProsRankings() {
    window.open("https://www.fantasypros.com/nfl/rankings/consensus-cheatsheets.php", "_blank", "noopener,noreferrer");
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
    );
    teamManagerState = payload.state;
    teamNeeds = payload.needs;
    teamLineupSummary = payload.lineupSummary;
    teamWeekContext = payload.weekContext;
    teamWaiverSummary = payload.waiverSummary;
    teamActivitySummary = payload.activitySummary;
    return payload.answer;
  }
  async function askManager(question: string, conversationHistory: AiConversationMessage[] = []): Promise<string> {
    const payload = await askManagerRequest(
      activeDraftId,
      activeUserRosterId,
      question,
      conversationHistory,
      playerPreferenceSummary(),
      recommendationPreferenceRequest(),
    );
    recommendation = payload.recommendation;
    return payload.answer;
  }

  const userTeam = $derived(getUserTeam(draftState));
  const activeSourceLabel = $derived(draftState ? (isMockDraft(activeDraftId) ? "Demo draft" : "Sleeper draft") : "No draft loaded");
  const isDemoDraftActive = $derived(Boolean(draftState && isMockDraft(activeDraftId)));
  const isRealDraftActive = $derived(Boolean(draftState && !isMockDraft(activeDraftId)));
  const hasImportedRankings = $derived(Boolean(rankingImportSummary));
  const importMatchRate = $derived.by(() => {
    const summary = rankingImportSummary;
    if (!summary || !summary.rowsParsed) {
      return null;
    }
    return Math.round((summary.matched / summary.rowsParsed) * 100);
  });
  const recommendationsUsePlaceholder = $derived.by(() => {
    const currentRecommendation = recommendation;
    return Boolean(
      isRealDraftActive &&
        currentRecommendation?.candidates.some((candidate) => candidate.player.projectionSource === "sleeper_search_rank"),
    );
  });
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
      tone: activeUserRosterId || selectedLeague?.userRosterId ? "ready" : isRealDraftActive ? "warning" : "neutral",
    },
    {
      label: "Player values",
      value: hasImportedRankings ? "Imported" : draftState ? "Needed" : "Pending",
      detail: hasImportedRankings
        ? `${rankingImportSummary?.matched ?? 0} players matched${importMatchRate === null ? "" : ` (${importMatchRate}%)`}`
        : isRealDraftActive
          ? "Import FantasyPros CSV"
          : isDemoDraftActive
            ? "Demo projections active"
            : "Available after draft selection",
      tone: hasImportedRankings || isDemoDraftActive ? (rankingImportSummary && (rankingImportSummary.unmatched.length > 0 || rankingImportSummary.ambiguous.length > 0) ? "warning" : "ready") : isRealDraftActive ? "warning" : "neutral",
    },
  ]);
  const setupComplete = $derived(readinessItems.every((item) => item.tone === "ready" || item.tone === "neutral"));
  const manageAvailable = $derived(Boolean(teamManagerState) && isRealDraftActive);
  const showSetupChecklist = $derived(!draftState || !setupComplete || connectExpanded);
  const draftPhase = $derived(getDraftPhase(draftState));

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
      codexAuthStatus={experimentalCodexAuthStatus}
      isStartingCodexLogin={isStartingExperimentalCodexLogin}
      isPollingCodexLogin={isPollingExperimentalCodexLogin}
      onSave={saveSettings}
      onStartCodexLogin={startExperimentalCodexAuth}
      onPollCodexLogin={pollExperimentalCodexAuth}
      onLogoutCodex={logoutExperimentalCodexAuth}
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
        {activeUserRosterId}
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
      <DraftSummaryStrip state={draftState} />

      {#if workspaceMode === "draft"}
        {#if draftPhase !== "complete"}
          <TeamNeedsStrip needs={teamNeeds} />
        {/if}
        <section class="dashboard-grid draft-grid">
          <div class="primary-column">
            {#if draftPhase === "complete"}
              <article class="panel phase-note">
                <h2>Draft is over</h2>
                <p>Recommendations and pick tools stay here for review. Switch to Season for lineups, waivers, and weekly decisions.</p>
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
                {recommendation}
                playerPreferences={playerPreferences}
                showPlaceholderWarning={recommendationsUsePlaceholder}
                onSetPreference={setPlayerPreference}
                onWhatIf={askWhatIf}
                onClearPreferences={clearPlayerPreferences}
                onOpenRankings={() => (rankingsExpanded = true)}
              />
              <AskManagerPanel
                onAsk={askManager}
                providerStatus={aiProviderStatus}
                {hasImportedRankings}
                showPlaceholderWarning={recommendationsUsePlaceholder}
                {draftState}
                {recommendation}
              />
            {:else}
              <RosterPanel state={draftState} />
              <PickFeedPanel state={draftState} />
            {/if}
          </div>
          <div class="side-column">
            {#if draftPhase !== "complete"}
              <RankingsImportPanel
                hasDraft={true}
                {hasImportedRankings}
                {isImportingRankings}
                {isClearingRankings}
                {rankingImportSummary}
                {rankingImportError}
                onImport={importRankings}
                onClear={clearRankings}
                onOpenFantasyPros={openFantasyProsRankings}
                bind:expanded={rankingsExpanded}
              />
              <RosterPanel state={draftState} />
              <PickFeedPanel state={draftState} />
            {:else if hasImportedRankings}
              <RankingsImportPanel
                hasDraft={true}
                {hasImportedRankings}
                {isImportingRankings}
                {isClearingRankings}
                {rankingImportSummary}
                {rankingImportError}
                onImport={importRankings}
                onClear={clearRankings}
                onOpenFantasyPros={openFantasyProsRankings}
                bind:expanded={rankingsExpanded}
              />
            {/if}
          </div>
        </section>
      {:else}
        <section class="dashboard-grid manage-grid">
          <div class="primary-column">
            <MyTeamPanel state={teamManagerState} error={teamManagerError} isLoading={isLoadingTeamManager} />
            <TeamNeedsPanel needs={teamNeeds} />
            <TeamLineupPanel lineupSummary={teamLineupSummary} isLoading={isLoadingTeamManager} onAsk={(question) => { void askTeamManager(question); }} />
            <TeamAskPanel teamState={teamManagerState} teamNeeds={teamNeeds} lineupSummary={teamLineupSummary} weekContext={teamWeekContext} waiverSummary={teamWaiverSummary} activitySummary={teamActivitySummary} onAsk={askTeamManager} providerStatus={aiProviderStatus} />
          </div>
          <div class="side-column">
            <TeamWeekPanel weekContext={teamWeekContext} isLoading={isLoadingTeamManager} />
            <TeamWaiverPanel waiverSummary={teamWaiverSummary} isLoading={isLoadingTeamManager} onAsk={(question) => { void askTeamManager(question); }} />
            <TeamActivityPanel activitySummary={teamActivitySummary} isLoading={isLoadingTeamManager} onAsk={(question) => { void askTeamManager(question); }} />
          </div>
        </section>
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

  .connect-editor {
    margin-bottom: var(--space-5);
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



















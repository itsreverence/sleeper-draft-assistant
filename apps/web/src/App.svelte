<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";

  import TopBar from "./lib/components/TopBar.svelte";
  import SetupChecklist from "./lib/components/SetupChecklist.svelte";
  import ConnectPanel from "./lib/components/ConnectPanel.svelte";
  import RankingsImportPanel from "./lib/components/RankingsImportPanel.svelte";
  import SettingsDrawer from "./lib/components/SettingsDrawer.svelte";
  import DraftSwitcherDrawer from "./lib/components/DraftSwitcherDrawer.svelte";
  import DraftRoomPanel from "./lib/components/DraftRoomPanel.svelte";
  import DraftTeamDrawer from "./lib/components/DraftTeamDrawer.svelte";
  import PlayerSearchDialog from "./lib/components/PlayerSearchDialog.svelte";
  import RecommendationPanel from "./lib/components/RecommendationPanel.svelte";
  import DraftStrategyDrawer from "./lib/components/DraftStrategyDrawer.svelte";
  import RosterPanel from "./lib/components/RosterPanel.svelte";
  import MyTeamPanel from "./lib/components/MyTeamPanel.svelte";
  import TeamAskPanel from "./lib/components/TeamAskPanel.svelte";
  import TeamActivityPanel from "./lib/components/TeamActivityPanel.svelte";
  import TeamDataDrawer from "./lib/components/TeamDataDrawer.svelte";
  import TeamRefreshStatus from "./lib/components/TeamRefreshStatus.svelte";
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
    createDraftEventSource as openDraftEventStream,
    createDraftStrategyInstruction,
    deleteDraftStrategyInstruction,
    fetchAiStatus,
    fetchDraftRecommendationRequest,
    fetchDecisionHistory,
    fetchAiDraftStrategyRequest,
    fetchDraftState,
    fetchDraftStrategyInstructions,
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
    updateDraftStrategyInstruction,
  } from "./lib/api";
  import { draftTeamReference, getDraftPhase, getUserTeam, isMockDraft, picksUntilUserTurn, preferredWorkspaceMode } from "./lib/format";
  import {
    normalizeTeamProjectionOverride,
    shouldRefreshTeamManager,
    TEAM_REFRESH_INTERVAL_MS,
    teamPayloadFingerprint,
  } from "./lib/team-refresh";
  import { buildCandidateDiscussionQuestion, buildPlayerDiscussionQuestion, currentAiDraftStrategy, shouldRequestAiDraftStrategy } from "./lib/ai-panel";
  import { createDraftSession, type DraftSessionGuard } from "./lib/draft-session.svelte";
  import { buildFantasyProsWeeklyProjectionUrl } from "./lib/fantasypros";
  import { getImportFreshness } from "./lib/freshness";
  import { shouldOpenDraftPreparation } from "./lib/draft-preparation";
  import type { WorkspaceMode } from "./lib/format";
  import { conversationalAiProviderStatus, isAiProviderAvailable } from "./lib/types";
  import type {
    ConnectDraft,
    ConnectLeague,
    AiProviderStatus,
    AppSettings,
    ConnectPayload,
    DraftPayload,
    DraftScoringFormat,
    DraftState,
    DecisionSnapshot,
    AiDraftStrategyPayload,
    RankingImportSummary,
    RosRankingImportSummary,
    TeamActivitySummary,
    TeamDataReadiness,
    TeamManagerState,
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
    DraftStrategyInstruction,
    DraftStrategyProposal,
    DraftAskResult,
  } from "./lib/types";

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
  let loadError = $state("");
  let teamManagerState: TeamManagerState | null = $state(null);
  let teamDataReadiness: TeamDataReadiness | null = $state(null);
  let teamWeekContext: TeamWeekContext | null = $state(null);
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
  let loadDraftRequestId = 0;
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
  let rankingMutationRequestId = 0;
  let seasonProjectionMutationRequestId = 0;
  let adpMutationRequestId = 0;
  let isLoading = $state(false);
  let isConnecting = $state(false);
  let isSavingSettings = $state(false);
  let settingsOpen = $state(false);
  let settingsReturnFocus: HTMLElement | null = $state(null);
  let draftSwitcherOpen = $state(false);
  let teamDataOpen = $state(false);
  let appSettings: AppSettings | null = $state(null);
  let aiProviderStatus: AiProviderStatus | null = $state(null);
  let settingsError = $state("");
  let isCopyingDiagnostics = $state(false);
  let diagnosticsStatus = $state("");
  let decisionSnapshots: DecisionSnapshot[] = $state([]);
  let decisionHistoryError = $state("");
  let isLoadingDecisionHistory = $state(false);
  let decisionHistoryRequestId = 0;
  let draftStrategyOpen = $state(false);
  let selectedDraftTeamId: string | null = $state(null);
  let playerSearchOpen = $state(false);
  let draftQuestionRequest: { id: number; question: string } | null = $state(null);
  let draftQuestionRequestId = 0;
  let teamQuestionRequest: { id: number; question: string } | null = $state(null);
  let teamQuestionRequestId = 0;
  let resolvedAiDraftStrategy: { draftId: string; payload: AiDraftStrategyPayload } | null = $state(null);
  let strategyInstructions: DraftStrategyInstruction[] = $state([]);
  let strategyInstructionsBusy = $state(false);
  let strategyInstructionsError = $state("");
  let strategyInstructionLoadKey = "";

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

  const draftSession = createDraftSession({
    fetchDraftState,
    fetchRecommendation: fetchDraftRecommendationRequest,
    createEventSource: openDraftEventStream,
    getPlayerPreferences: () => playerPreferences,
    isMockDraft,
    now: () => Date.now(),
    storage: window.localStorage,
    onPayloadCommitted: () => {
      if (draftSession.activeDraftId) {
        void loadDecisionHistory();
      }
    },
    onRecommendationCommitted: () => {
      if (draftSession.activeDraftId) {
        void loadDecisionHistory();
      }
    },
    onPreferenceRefreshFailed: (message) => {
      lastEvent = message;
    },
    onStreamUpdate: (update) => {
      status = update.status;
      lastEvent = update.lastEvent;
    },
  });

  const draftState = $derived(draftSession.draftState);
  const recommendation = $derived(draftSession.recommendation);
  const rankingImportSummary = $derived(draftSession.rankingImportSummary);
  const seasonProjectionImportSummary = $derived(draftSession.seasonProjectionImportSummary);
  const adpImportSummary = $derived(draftSession.adpImportSummary);
  const activeDraftId = $derived(draftSession.activeDraftId);
  const activeDraftTeamRef = $derived(draftSession.activeDraftTeamRef);
  const activeDraftIdentity = $derived(activeDraftId ? `${activeDraftId}:${activeDraftTeamRef ?? ""}` : "");
  const activeUserRosterId = $derived(draftSession.activeUserRosterId);
  const draftLastSuccessfulAt = $derived(draftSession.draftLastSuccessfulAt);
  const draftConsecutiveFailures = $derived(draftSession.draftConsecutiveFailures);
  const draftNextRetryMs = $derived(draftSession.draftNextRetryMs);
  const draftReconnecting = $derived(draftSession.draftReconnecting);

  function isCurrentLoadDraftRequest(requestId: number): boolean {
    return requestId === loadDraftRequestId;
  }

  function resetDraftImportState() {
    rankingImportError = "";
    seasonProjectionImportError = "";
    adpImportError = "";
    isImportingRankings = false;
    isClearingRankings = false;
    isImportingSeasonProjections = false;
    isClearingSeasonProjections = false;
    isImportingAdp = false;
    isClearingAdp = false;
  }

  function currentDraftGuard(): DraftSessionGuard | null {
    return draftSession.captureGuard();
  }

  function beginRankingMutation(): number {
    isImportingRankings = false;
    isClearingRankings = false;
    return ++rankingMutationRequestId;
  }

  function isCurrentRankingMutation(requestId: number): boolean {
    return requestId === rankingMutationRequestId;
  }

  function beginSeasonProjectionMutation(): number {
    isImportingSeasonProjections = false;
    isClearingSeasonProjections = false;
    return ++seasonProjectionMutationRequestId;
  }

  function isCurrentSeasonProjectionMutation(requestId: number): boolean {
    return requestId === seasonProjectionMutationRequestId;
  }

  function beginAdpMutation(): number {
    isImportingAdp = false;
    isClearingAdp = false;
    return ++adpMutationRequestId;
  }

  function isCurrentAdpMutation(requestId: number): boolean {
    return requestId === adpMutationRequestId;
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
    await draftSession.applyCurrentPreferences(preferences);
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
  let switchingDraft = $state(false);
  let draftPreparationOpen = $state(false);
  let emergencyBoardMode = $state(false);
  let workspaceMode: WorkspaceMode = $state("draft");
  let reviewingDraftResults = $state(false);
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
    draftSession.destroy();
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
      const nextProviderStatus = await fetchAiStatus();
      aiProviderStatus = nextProviderStatus;
      const codexReady = nextProviderStatus.id === "codex-app-server"
        && isAiProviderAvailable(nextProviderStatus);
      if (draftState && draftState.status !== "complete" && !codexReady) {
        workspaceMode = "draft";
        emergencyBoardMode = false;
        draftPreparationOpen = true;
      }
      return true;
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not save settings.";
      return false;
    } finally {
      isSavingSettings = false;
    }
  }

  async function retryAiProvider() {
    try {
      aiProviderStatus = await fetchAiStatus();
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not check Codex status.";
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

  async function resetRendererData(settings: AppSettings) {
    try {
      const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => Boolean(key))
        .filter((key) =>
          key.startsWith("playerPreferences:") ||
          ["lastDraftId", "lastDraftTeamRef", "lastUserRosterId", "lastLeagueId", "sleeperUsername", "sleeperSeason", "sleeperLeagueInput"].includes(key),
        );
      for (const key of keys) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Continue resetting in-memory state if renderer storage is unavailable.
    }

    draftQuestionRequest = null;
    draftQuestionRequestId += 1;
    teamQuestionRequest = null;
    teamQuestionRequestId += 1;
    decisionHistoryRequestId += 1;
    strategyInstructionLoadKey = "";
    try {
      clearActiveDraft();
    } catch {
      // State is cleared before the best-effort persisted-key cleanup.
    }
    try {
      resetSleeperLookup();
    } catch {
      // State is cleared before the best-effort persisted-key cleanup.
    }

    draftInput = "";
    userRosterIdInput = "";
    playerPreferences = {};
    switchingDraft = false;
    draftSwitcherOpen = false;
    draftStrategyOpen = false;
    selectedDraftTeamId = null;
    playerSearchOpen = false;
    decisionSnapshots = [];
    decisionHistoryError = "";
    isLoadingDecisionHistory = false;
    resolvedAiDraftStrategy = null;
    strategyInstructions = [];
    strategyInstructionsBusy = false;
    strategyInstructionsError = "";
    appSettings = settings;
    aiProviderStatus = null;
    settingsError = "";
    diagnosticsStatus = "";
    isCopyingDiagnostics = false;
    isSavingSettings = false;
    isConnecting = false;
    settingsOpen = false;
    settingsReturnFocus = null;
    status = "Connect Sleeper";
    lastEvent = "Enter a username or paste a league URL to begin";

    try {
      aiProviderStatus = await fetchAiStatus();
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "Could not refresh AI status.";
    }

    await tick();
    document.getElementById("connect-username")?.focus();
  }

  async function findSleeperLeagues() {
    const username = usernameInput.trim();
    if (!username) {
      loadError = "Enter a Sleeper username or user ID.";
      return;
    }

    if (isDemoDraftActive) {
      draftSession.disconnect();
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
      if (payload.leagues.length === 0) {
        status = "No Sleeper leagues found";
      } else if (payload.leagues.length > 1) {
        status = "Choose a Sleeper league";
      } else if (selectedDraftId) {
        status = "Ready to open";
      } else {
        status = "No Sleeper drafts found";
      }
      lastEvent = firstLeague && payload.leagues.length === 1
        ? `${firstLeague.name} selected for ${payload.user.displayName ?? payload.user.username ?? payload.user.userId}`
        : `Loaded ${payload.season} leagues for ${payload.user.displayName ?? payload.user.username ?? payload.user.userId}`;
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

  function resetSleeperLookup() {
    usernameInput = "";
    seasonInput = "";
    leagueInput = "";
    connectPayload = null;
    selectedLeagueId = "";
    selectedDraftId = "";
    loadError = "";
    window.localStorage.removeItem("sleeperUsername");
    window.localStorage.removeItem("sleeperSeason");
    window.localStorage.removeItem("sleeperLeagueInput");
  }

  function selectLeague(league: ConnectLeague) {
    selectedLeagueId = league.leagueId;
    selectedDraftId = league.recommendedDraftId ?? league.drafts[0]?.draftId ?? "";
    loadError = "";
    status = selectedDraftId ? "Ready to open" : "No Sleeper drafts found";
    lastEvent = `${league.name} selected`;
  }

  async function loadStrategyInstructions() {
    if (!activeDraftId || !draftState) {
      strategyInstructions = [];
      strategyInstructionLoadKey = "";
      return;
    }
    const key = `${activeDraftId}:${activeDraftTeamRef ?? ""}:${draftState.currentPick}`;
    if (key === strategyInstructionLoadKey) return;
    strategyInstructionLoadKey = key;
    strategyInstructionsError = "";
    try {
      const payload = await fetchDraftStrategyInstructions(activeDraftId, activeDraftTeamRef);
      if (key === strategyInstructionLoadKey) strategyInstructions = payload.instructions;
    } catch (error) {
      if (key === strategyInstructionLoadKey) {
        strategyInstructionsError = error instanceof Error ? error.message : "Could not load draft strategy guidance.";
      }
    }
  }

  async function addStrategyInstruction(proposal: DraftStrategyProposal, source: "manual" | "ai-chat" = "manual") {
    if (!activeDraftId) return;
    strategyInstructionsBusy = true;
    strategyInstructionsError = "";
    try {
      const payload = await createDraftStrategyInstruction(activeDraftId, activeDraftTeamRef, proposal, source);
      strategyInstructions = payload.instructions;
    } catch (error) {
      strategyInstructionsError = error instanceof Error ? error.message : "Could not add draft strategy guidance.";
      throw error;
    } finally {
      strategyInstructionsBusy = false;
    }
  }

  async function editStrategyInstruction(instructionId: string, proposal: DraftStrategyProposal) {
    if (!activeDraftId) return;
    strategyInstructionsBusy = true;
    strategyInstructionsError = "";
    try {
      const payload = await updateDraftStrategyInstruction(activeDraftId, activeDraftTeamRef, instructionId, proposal);
      strategyInstructions = payload.instructions;
    } catch (error) {
      strategyInstructionsError = error instanceof Error ? error.message : "Could not update draft strategy guidance.";
      throw error;
    } finally {
      strategyInstructionsBusy = false;
    }
  }

  async function removeStrategyInstruction(instructionId: string) {
    if (!activeDraftId) return;
    strategyInstructionsBusy = true;
    strategyInstructionsError = "";
    try {
      const payload = await deleteDraftStrategyInstruction(activeDraftId, activeDraftTeamRef, instructionId);
      strategyInstructions = payload.instructions;
    } catch (error) {
      strategyInstructionsError = error instanceof Error ? error.message : "Could not remove draft strategy guidance.";
      throw error;
    } finally {
      strategyInstructionsBusy = false;
    }
  }

  function selectDraft(draft: ConnectDraft) {
    selectedDraftId = draft.draftId;
    loadError = "";
    status = "Ready to open";
    lastEvent = `${draft.name} selected`;
  }

  async function openSelectedDraft(): Promise<boolean> {
    if (!selectedLeague || !selectedDraft) {
      loadError = "Choose a league and draft first.";
      return false;
    }

    const draftTeamRef = draftTeamReference(selectedDraft, selectedLeague.userRosterId);
    return loadDraft(selectedDraft.draftId, draftTeamRef, selectedLeague.leagueId, selectedLeague.userRosterId);
  }

  async function switchToKnownDraft(draftId: string): Promise<boolean> {
    const match = connectPayload?.leagues.flatMap((league) =>
      league.drafts.map((draft) => ({ league, draft })),
    ).find(({ draft }) => draft.draftId === draftId);
    if (!match) return false;
    const draftTeamRef = draftTeamReference(match.draft, match.league.userRosterId);
    return loadDraft(draftId, draftTeamRef, match.league.leagueId, match.league.userRosterId);
  }

  async function connectSleeperDraft(): Promise<boolean> {
    const draftId = draftInput.trim();
    if (!draftId) {
      loadError = "Enter a Sleeper draft ID to load a real draft.";
      return false;
    }

    const explicitRosterId = userRosterIdInput.trim() || null;
    return loadDraft(
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
    loadDraftRequestId += 1;
    rankingMutationRequestId += 1;
    seasonProjectionMutationRequestId += 1;
    adpMutationRequestId += 1;
    draftSession.clear();
    resetDraftImportState();
    resetTeamRefreshTracking();
    teamDataOpen = false;
    teamManagerState = null;
    teamDataReadiness = null;
    teamWeekContext = null;
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
    loadError = "";
    isLoading = false;
    connectExpanded = true;
    draftPreparationOpen = false;
    emergencyBoardMode = false;
    workspaceMode = "draft";
    reviewingDraftResults = false;
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
  ): Promise<boolean> {
    const requestId = ++loadDraftRequestId;
    isLoading = true;
    loadError = "";
    resetDraftImportState();
    status = isMockDraft(draftId) ? "Loading demo draft" : "Loading Sleeper draft";
    lastEvent = "Waiting for event stream";

    try {
      loadPlayerPreferences(draftId);
      const activation = await draftSession.activate({
        draftId,
        draftTeamRef,
        leagueId,
        userRosterId,
        userIdentifier,
      });
      if (!activation || !isCurrentLoadDraftRequest(requestId)) {
        return false;
      }

      const { payload, resolvedLeagueId } = activation;
      if (teamManagerState?.league.id !== resolvedLeagueId) {
        resetTeamRefreshTracking();
        teamProjectionSeason = "";
        teamProjectionWeek = 0;
        weeklyProjectionSummary = null;
        rosRankingSummary = null;
        weeklyProjectionError = "";
        rosRankingError = "";
      }
      void loadTeamManager(resolvedLeagueId, userRosterId);
      if (hasPlayerPreferences()) {
        void refreshRecommendationWithPreferences();
      }
      connectExpanded = false;
      switchingDraft = false;
      draftPreparationOpen = shouldOpenDraftPreparation(
        draftId,
        payload.state.status,
        {
          rankingsAppliedAt: payload.rankingImportSummary?.appliedAt ?? null,
          hasProjections: Boolean(payload.seasonProjectionImportSummary),
          hasAdp: Boolean(payload.adpImportSummary),
          aiReady: aiProviderStatus?.id === "codex-app-server" && isAiProviderAvailable(aiProviderStatus),
        },
      );
      emergencyBoardMode = false;
      status = isMockDraft(draftId) ? "Demo draft loaded" : "Sleeper draft loaded";
      return true;
    } catch (error) {
      if (!isCurrentLoadDraftRequest(requestId)) {
        return false;
      }
      loadError = error instanceof Error ? error.message : "Draft load failed.";
      status = "Draft unavailable";
      draftSession.clear();
      decisionSnapshots = [];
      decisionHistoryError = "";
      teamManagerState = null;
      teamDataReadiness = null;
      teamWeekContext = null;
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
      emergencyBoardMode = false;
      workspaceMode = "draft";
      reviewingDraftResults = false;
      phaseSyncKey = "";
      window.localStorage.removeItem("lastDraftId");
      window.localStorage.removeItem("lastDraftTeamRef");
      window.localStorage.removeItem("lastUserRosterId");
      window.localStorage.removeItem("lastLeagueId");
      return false;
    } finally {
      if (isCurrentLoadDraftRequest(requestId)) {
        isLoading = false;
      }
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
      teamWeekContext = null;
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
        teamWeekContext = null;
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
    const projectionOverride = normalizeTeamProjectionOverride({
      season: teamProjectionSeason,
      week: teamProjectionWeek,
      activeSeason: payload.state.league.season,
      activeWeek: payload.state.week,
    });
    teamManagerState = payload.state;
    teamDataReadiness = payload.dataReadiness;
    teamWeekContext = payload.weekContext;
    teamActivitySummary = payload.activitySummary;
    rosRankingSummary = payload.rosRankingSummary;
    weeklyProjectionSummary = payload.weeklyProjectionSummary;
    teamProjectionSeason = projectionOverride.season;
    teamProjectionWeek = projectionOverride.week;
  }

  function applyDraftPayload(payload: DraftPayload, refreshPreferences = false) {
    draftSession.applyCommittedPayload(payload, { refreshPreferences });
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

  function reconnectDraftEvents() {
    draftSession.reconnect();
  }

  async function importRankings(csvText: string) {
    if (!csvText) {
      rankingImportError = "Upload or paste a FantasyPros CSV first.";
      return;
    }

    const guard = currentDraftGuard();
    if (!guard) {
      rankingImportError = "Open a draft before importing rankings.";
      return;
    }

    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    const requestTeamLeagueId = teamManagerState?.league.id ?? null;
    const requestUserRosterId = activeUserRosterId;
    const requestScoring = normalizeDraftScoring(draftState?.settings.scoring);
    const requestId = beginRankingMutation();
    isImportingRankings = true;
    rankingImportError = "";

    try {
      const payload = await importRankingsRequest(
        requestDraftId,
        requestDraftTeamRef,
        csvText,
        requestScoring,
      );
      if (!draftSession.isGuardCurrent(guard) || !isCurrentRankingMutation(requestId)) {
        return;
      }
      applyDraftPayload(payload, true);
      if (requestTeamLeagueId) {
        void loadTeamManager(requestTeamLeagueId, requestUserRosterId);
      }
      status = "FantasyPros rankings imported";
      lastEvent = `${payload.summary.matched} matched from ${payload.summary.rowsParsed} rows`;
    } catch (error) {
      if (!draftSession.isGuardCurrent(guard) || !isCurrentRankingMutation(requestId)) {
        return;
      }
      rankingImportError = error instanceof Error ? error.message : "Ranking import failed.";
    } finally {
      if (draftSession.isGuardCurrent(guard) && isCurrentRankingMutation(requestId)) {
        isImportingRankings = false;
      }
    }
  }

  async function clearRankings() {
    if (!activeDraftId) {
      rankingImportError = "Open a draft before clearing rankings.";
      return;
    }

    const guard = currentDraftGuard();
    if (!guard) {
      rankingImportError = "Open a draft before clearing rankings.";
      return;
    }

    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    const requestTeamLeagueId = teamManagerState?.league.id ?? null;
    const requestUserRosterId = activeUserRosterId;
    const requestId = beginRankingMutation();
    isClearingRankings = true;
    rankingImportError = "";

    try {
      const payload = await clearRankingsRequest(requestDraftId, requestDraftTeamRef);
      if (!draftSession.isGuardCurrent(guard) || !isCurrentRankingMutation(requestId)) {
        return;
      }
      applyDraftPayload(payload, true);
      draftPreparationOpen = draftState?.status !== "complete";
      emergencyBoardMode = false;
      if (requestTeamLeagueId) {
        void loadTeamManager(requestTeamLeagueId, requestUserRosterId);
      }
      status = "FantasyPros rankings cleared";
      lastEvent = seasonProjectionImportSummary
        ? "Expert ranks cleared; season projections remain active"
        : "Recommendations returned to Sleeper placeholder values";
    } catch (error) {
      if (!draftSession.isGuardCurrent(guard) || !isCurrentRankingMutation(requestId)) {
        return;
      }
      rankingImportError = error instanceof Error ? error.message : "Could not clear imported rankings.";
    } finally {
      if (draftSession.isGuardCurrent(guard) && isCurrentRankingMutation(requestId)) {
        isClearingRankings = false;
      }
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
    const guard = currentDraftGuard();
    if (!guard) {
      seasonProjectionImportError = "Open a draft before importing projections.";
      return;
    }
    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    const requestTeamLeagueId = teamManagerState?.league.id ?? null;
    const requestUserRosterId = activeUserRosterId;
    const requestId = beginSeasonProjectionMutation();
    isImportingSeasonProjections = true;
    seasonProjectionImportError = "";
    try {
      const payload = await importSeasonProjectionsRequest({
        draftId: requestDraftId,
        userRosterId: requestDraftTeamRef,
        season: input.season,
        files: input.files,
      });
      if (!draftSession.isGuardCurrent(guard) || !isCurrentSeasonProjectionMutation(requestId)) {
        return;
      }
      applyDraftPayload(payload, true);
      if (requestTeamLeagueId) {
        void loadTeamManager(requestTeamLeagueId, requestUserRosterId);
      }
      status = "FantasyPros season projections imported";
      lastEvent = `${payload.summary.matched} projection rows matched`;
    } catch (error) {
      if (!draftSession.isGuardCurrent(guard) || !isCurrentSeasonProjectionMutation(requestId)) {
        return;
      }
      seasonProjectionImportError = error instanceof Error ? error.message : "Season projection import failed.";
    } finally {
      if (draftSession.isGuardCurrent(guard) && isCurrentSeasonProjectionMutation(requestId)) {
        isImportingSeasonProjections = false;
      }
    }
  }

  async function clearSeasonProjections() {
    if (!activeDraftId) {
      return;
    }
    const guard = currentDraftGuard();
    if (!guard) {
      return;
    }
    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    const requestId = beginSeasonProjectionMutation();
    isClearingSeasonProjections = true;
    seasonProjectionImportError = "";
    try {
      const payload = await clearSeasonProjectionsRequest(requestDraftId, requestDraftTeamRef);
      if (!draftSession.isGuardCurrent(guard) || !isCurrentSeasonProjectionMutation(requestId)) {
        return;
      }
      applyDraftPayload(payload, true);
      status = "Season projections cleared";
    } catch (error) {
      if (!draftSession.isGuardCurrent(guard) || !isCurrentSeasonProjectionMutation(requestId)) {
        return;
      }
      seasonProjectionImportError = error instanceof Error ? error.message : "Could not clear season projections.";
    } finally {
      if (draftSession.isGuardCurrent(guard) && isCurrentSeasonProjectionMutation(requestId)) {
        isClearingSeasonProjections = false;
      }
    }
  }

  async function importAdp(csvText: string, season: string) {
    if (!activeDraftId || !season || !csvText) {
      adpImportError = "Select a draft and upload the FantasyPros overall ADP CSV.";
      return;
    }
    const guard = currentDraftGuard();
    if (!guard) {
      adpImportError = "Open a draft before importing Sleeper ADP.";
      return;
    }
    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    const requestId = beginAdpMutation();
    isImportingAdp = true;
    adpImportError = "";
    try {
      const payload = await importAdpRequest({
        draftId: requestDraftId,
        userRosterId: requestDraftTeamRef,
        season,
        csvText,
      });
      if (!draftSession.isGuardCurrent(guard) || !isCurrentAdpMutation(requestId)) {
        return;
      }
      applyDraftPayload(payload, true);
      status = "FantasyPros Sleeper ADP imported";
      lastEvent = `${payload.summary.matched} ADP rows matched`;
    } catch (error) {
      if (!draftSession.isGuardCurrent(guard) || !isCurrentAdpMutation(requestId)) {
        return;
      }
      adpImportError = error instanceof Error ? error.message : "Sleeper ADP import failed.";
    } finally {
      if (draftSession.isGuardCurrent(guard) && isCurrentAdpMutation(requestId)) {
        isImportingAdp = false;
      }
    }
  }

  async function clearAdp() {
    if (!activeDraftId) {
      return;
    }
    const guard = currentDraftGuard();
    if (!guard) {
      return;
    }
    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    const requestId = beginAdpMutation();
    isClearingAdp = true;
    adpImportError = "";
    try {
      const payload = await clearAdpRequest(requestDraftId, requestDraftTeamRef);
      if (!draftSession.isGuardCurrent(guard) || !isCurrentAdpMutation(requestId)) {
        return;
      }
      applyDraftPayload(payload, true);
      status = "Sleeper ADP cleared";
    } catch (error) {
      if (!draftSession.isGuardCurrent(guard) || !isCurrentAdpMutation(requestId)) {
        return;
      }
      adpImportError = error instanceof Error ? error.message : "Could not clear Sleeper ADP.";
    } finally {
      if (draftSession.isGuardCurrent(guard) && isCurrentAdpMutation(requestId)) {
        isClearingAdp = false;
      }
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
    const scoring = normalizeDraftScoring(teamManagerState?.league.scoring);
    window.open(buildFantasyProsWeeklyProjectionUrl({ position, week, scoring }), "_blank", "noopener,noreferrer");
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

  function askAboutTeamActivity(question: string) {
    teamQuestionRequest = { id: ++teamQuestionRequestId, question };
  }

  function acknowledgeTeamQuestionRequest(requestId: number) {
    if (teamQuestionRequest?.id === requestId) {
      teamQuestionRequest = null;
    }
  }
  async function askManager(question: string, conversationHistory: AiConversationMessage[] = []): Promise<DraftAskResult> {
    const guard = currentDraftGuard();
    if (!guard) {
      throw new Error("Open a draft before asking draft questions.");
    }

    const requestDraftId = activeDraftId;
    const requestDraftTeamRef = activeDraftTeamRef;
    let payload;
    try {
      payload = await askManagerRequest(
        requestDraftId,
        requestDraftTeamRef,
        question,
        conversationHistory,
        playerPreferenceSummary(),
        recommendationPreferenceRequest(),
      );
    } catch (error) {
      try {
        const nextProviderStatus = await fetchAiStatus();
        aiProviderStatus = nextProviderStatus;
        if (!isAiProviderAvailable(nextProviderStatus)) {
          workspaceMode = "draft";
          emergencyBoardMode = false;
          draftPreparationOpen = true;
        }
      } catch {
        // Preserve the original, more useful AI request error if the status check also fails.
      }
      throw error;
    }
    if (draftSession.isGuardCurrent(guard)) {
      draftSession.replaceRecommendation(payload.recommendation);
    }
    return { answer: payload.answer, strategyProposal: payload.strategyProposal };
  }

  function askAboutCandidate(playerName: string, recommendedPlayerName: string) {
    draftQuestionRequest = {
      id: ++draftQuestionRequestId,
      question: buildCandidateDiscussionQuestion(playerName, recommendedPlayerName),
    };
  }

  function enterDraftRoom() {
    if (!draftAssistantReady) {
      return;
    }
    emergencyBoardMode = false;
    draftPreparationOpen = false;
  }

  function openEmergencyBoard() {
    if (draftState?.status !== "drafting" || draftAssistantReady) {
      return;
    }
    const confirmed = window.confirm(
      "Open emergency board-only mode? AI recommendations and draft questions will stay disabled until setup is complete.",
    );
    if (!confirmed) return;
    emergencyBoardMode = true;
    draftPreparationOpen = false;
  }

  function openDraftPreparation() {
    draftPreparationOpen = true;
  }

  function manageDraftDataFromSettings() {
    settingsOpen = false;
    workspaceMode = "draft";
    reviewingDraftResults = true;
    draftPreparationOpen = true;
  }

  function openSettings() {
    settingsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    settingsOpen = true;
  }

  async function closeSettings() {
    const returnFocus = settingsReturnFocus;
    settingsOpen = false;
    await tick();
    if (returnFocus?.isConnected) {
      returnFocus.focus();
    }
  }

  function toggleSettings() {
    if (settingsOpen) {
      void closeSettings();
    } else {
      openSettings();
    }
  }

  function askAboutSearchedPlayer(playerName: string) {
    const recommendedPlayerName = visibleAiDraftStrategy?.recommendedCandidate.player.name;
    draftQuestionRequest = {
      id: ++draftQuestionRequestId,
      question: buildPlayerDiscussionQuestion(playerName, recommendedPlayerName),
    };
  }

  function askAboutDraftTeam(teamId: string) {
    const team = draftState?.teams.find((candidate) => candidate.id === teamId);
    if (!team) {
      return;
    }
    selectedDraftTeamId = null;
    draftQuestionRequest = {
      id: ++draftQuestionRequestId,
      question: `How should ${team.name}'s current roster and likely positional demand affect my strategy before my next pick?`,
    };
  }

  function viewDraftResults() {
    if (draftPhase !== "complete") return;
    reviewingDraftResults = true;
    workspaceMode = "draft";
  }

  function openTeamManager() {
    if (!manageAvailable) return;
    reviewingDraftResults = false;
    workspaceMode = "manage";
  }

  async function requestAiDraftStrategy(): Promise<AiDraftStrategyPayload> {
    const draftId = activeDraftId;
    const payload = await fetchAiDraftStrategyRequest(
      draftId,
      activeDraftTeamRef,
      playerPreferenceSummary(),
      recommendationPreferenceRequest(),
    );
    resolvedAiDraftStrategy = { draftId, payload };
    void loadDecisionHistory();
    return payload;
  }

  const conversationalProviderStatus = $derived(conversationalAiProviderStatus(aiProviderStatus));
  const codexProviderReady = $derived.by(() =>
    aiProviderStatus?.id === "codex-app-server" && isAiProviderAvailable(aiProviderStatus),
  );
  const userTeam = $derived(getUserTeam(draftState));
  const picksUntilTurn = $derived(picksUntilUserTurn(draftState));
  const shouldRequestAiStrategy = $derived(
    shouldRequestAiDraftStrategy(draftState, conversationalProviderStatus, picksUntilTurn),
  );
  const aiDraftStrategyEnabled = $derived(
    shouldRequestAiDraftStrategy(draftState, conversationalProviderStatus, 0),
  );
  const visibleAiDraftStrategy = $derived.by(() => {
    const state: DraftState | null = draftState;
    const resolved: { draftId: string; payload: AiDraftStrategyPayload } | null = resolvedAiDraftStrategy;
    if (!state || !resolved || resolved.draftId !== activeDraftId) {
      return null;
    }
    return currentAiDraftStrategy(resolved.payload, state.currentPick);
  });
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
  const draftValuesIncomplete = $derived(
    isRealDraftActive
    && (!hasImportedRankings || rankingsStale || !hasSeasonProjections || !hasImportedAdp),
  );
  const draftAssistantReady = $derived(
    hasImportedRankings
    && !rankingsStale
    && hasSeasonProjections
    && hasImportedAdp
    && codexProviderReady,
  );
  const selectedLeague = $derived.by(() => {
    const payload = connectPayload;
    return payload?.leagues.find((league) => league.leagueId === selectedLeagueId) ?? null;
  });
  const selectedDraft = $derived.by(() => {
    const league = selectedLeague;
    return league?.drafts.find((draft) => draft.draftId === selectedDraftId) ?? null;
  });
  const userDraftSlot = $derived(
    userTeam?.draftSlot
      ?? selectedDraft?.userDraftSlot
      ?? (activeDraftTeamRef?.startsWith("slot-")
        ? Number(activeDraftTeamRef.replace("slot-", "")) || null
        : null),
  );

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
      value: userTeam
        ? `${userTeam.name}${userDraftSlot ? ` · Slot ${userDraftSlot}` : ""}`
        : userDraftSlot
          ? `Draft slot ${userDraftSlot}`
        : selectedLeague?.userRosterId
          ? `Roster ${selectedLeague.userRosterId}`
          : draftState
            ? "Unmatched"
            : "Pending",
      detail: userTeam && activeUserRosterId
        ? `Matched to Sleeper roster ${activeUserRosterId}`
        : userTeam
          ? "Matched from draft ownership"
        : selectedLeague?.userRosterId
          ? "Matched from Sleeper rosters"
          : draftState
            ? "Recommendations may miss roster needs"
            : "Matched after draft selection",
      tone: userTeam || activeUserRosterId || activeDraftTeamRef || selectedLeague?.userRosterId ? "ready" : isRealDraftActive ? "warning" : "neutral",
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
          ? "Season projections and Sleeper ADP are required for AI draft advice"
        : isRealDraftActive
          ? "FantasyPros ECR, projections, and Sleeper ADP are required"
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
      value: codexProviderReady ? "Codex" : "Required",
      detail: codexProviderReady
        ? "Local app-server selected"
        : "Connect a ready Codex app-server before entering the AI draft room",
      tone: codexProviderReady ? "ready" : isRealDraftActive ? "warning" : "neutral",
    },
  ]);
  const manageAvailable = $derived(Boolean(teamManagerState) && isRealDraftActive);
  const isPreconnect = $derived(!connectPayload && !draftState);
  const hasStartedConnecting = $derived(!isPreconnect);
  const showSetupChecklist = $derived(
    !switchingDraft && hasStartedConnecting && (!draftState || connectExpanded || (draftPreparationOpen && workspaceMode === "draft")),
  );
  const draftSwitcherOptions = $derived.by(() => {
    const options = connectPayload?.leagues.flatMap((league) =>
      league.drafts.map((draft) => ({
        draftId: draft.draftId,
        name: draft.name || league.name,
        detail: [draft.season ?? league.season, draft.status, draft.teams ? `${draft.teams} teams` : ""]
          .filter(Boolean)
          .join(" - "),
      })),
    ) ?? [];
    if (draftState && !options.some((option) => option.draftId === activeDraftId)) {
      options.unshift({
        draftId: activeDraftId,
        name: draftState.name,
        detail: [draftState.status.replace("_", " "), `${draftState.settings.teams} teams`]
          .filter(Boolean)
          .join(" - "),
      });
    }
    return options;
  });
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
      reviewingDraftResults = false;
      workspaceMode = preferredWorkspaceMode(draftPhase, manageAvailable);
      return;
    }

    if (!reviewingDraftResults && draftPhase === "complete" && manageAvailable && workspaceMode !== "manage") {
      workspaceMode = "manage";
    }
  });

  $effect(() => {
    const currentPick = draftState?.currentPick ?? 0;
    const draftId = activeDraftId;
    if (!draftId || !currentPick) {
      strategyInstructions = [];
      strategyInstructionLoadKey = "";
      return;
    }
    void loadStrategyInstructions();
  });

  $effect(() => {
    if (!manageAvailable && workspaceMode === "manage") {
      workspaceMode = "draft";
    }
  });
</script>

{#if settingsOpen}
  <SettingsDrawer
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
    onClose={closeSettings}
  />
{/if}

<main
  class="app-shell"
  class:preconnect-shell={isPreconnect || switchingDraft}
  class:preconnect-landing={(isPreconnect || switchingDraft) && !settingsOpen}
  inert={settingsOpen}
>
  <TopBar
    title={draftState?.name ?? (switchingDraft ? "Choose another draft" : "Connect your Sleeper draft")}
    {status}
    {lastEvent}
    connected={Boolean(draftState)}
    showStatus={hasStartedConnecting && !draftState && !switchingDraft}
    showChangeDraft={Boolean(draftState)}
    centered={isPreconnect || switchingDraft}
    compact={workspaceMode === "manage"}
    draftSwitcherOpen={draftSwitcherOpen}
    {settingsOpen}
    onOpenDraftSwitcher={() => (draftSwitcherOpen = true)}
    onOpenSettings={toggleSettings}
  />

  {#if draftSwitcherOpen && draftState}
    <DraftSwitcherDrawer
      draftOptions={draftSwitcherOptions}
      {activeDraftId}
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
      activeSourceLabel={activeSourceLabel || "Sleeper"}
      {activeUserRosterId}
      onFindLeagues={findSleeperLeagues}
      onResetLookup={resetSleeperLookup}
      onSelectLeague={selectLeague}
      onSelectDraft={selectDraft}
      onSelectKnownDraft={switchToKnownDraft}
      onOpenSelectedDraft={openSelectedDraft}
      onConnectSleeperDraft={connectSleeperDraft}
      onViewDraftResults={draftPhase === "complete" && workspaceMode === "manage" ? () => { draftSwitcherOpen = false; viewDraftResults(); } : undefined}
      onClose={() => (draftSwitcherOpen = false)}
    />
  {/if}

  {#if showSetupChecklist}
    <SetupChecklist items={readinessItems} />
  {/if}

  {#if connectExpanded}
    <div class="connect-editor" class:preconnect={isPreconnect || switchingDraft}>
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
        onResetLookup={resetSleeperLookup}
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
            aiConfigured={codexProviderReady}
            liveDraft={draftPhase === "drafting"}
            onContinue={enterDraftRoom}
            onOpenEmergency={openEmergencyBoard}
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
      <FormatCompatibilityNotice
        compatibility={workspaceMode === "manage"
          ? teamManagerState?.league.formatCompatibility
          : draftState.settings.formatCompatibility}
      />

      {#if workspaceMode === "draft"}
        <DraftRoomPanel
          state={draftState}
          draftLastSuccessfulAt={draftLastSuccessfulAt}
          draftConsecutiveFailures={draftConsecutiveFailures}
          draftNextRetryMs={draftNextRetryMs}
          draftReconnecting={draftReconnecting}
          onReconnectDraft={reconnectDraftEvents}
          onSelectTeam={(teamId) => {
            draftStrategyOpen = false;
            selectedDraftTeamId = teamId;
          }}
        />
        <section class="dashboard-grid draft-grid" class:single-column={!draftValuesIncomplete && !emergencyBoardMode}>
          <div class="primary-column">
            {#if draftPhase === "complete"}
              <article class="panel phase-note">
                <h2>Draft is over</h2>
                <p>The completed board and roster stay here for review. Team Manager remains the primary workspace for lineups, waivers, and weekly decisions.</p>
                {#if manageAvailable}
                  <button
                    class="btn btn-primary"
                    type="button"
                    onclick={openTeamManager}
                  >
                    Back to team manager
                  </button>
                {/if}
              </article>
            {/if}
            {#if draftPhase !== "complete"}
              {#if emergencyBoardMode}
                <article class="panel phase-note">
                  <h2>Emergency board-only mode</h2>
                  <p>Live pick tracking remains available. AI recommendations and draft questions are disabled until all required data and Codex are ready.</p>
                  <button class="btn btn-secondary" type="button" onclick={openDraftPreparation}>
                    Finish draft setup
                  </button>
                </article>
              {:else}
                <RecommendationPanel
                  draftState={draftState}
                  currentPick={draftState.currentPick}
                  aiEnabled={codexProviderReady}
                  aiStrategyEnabled={aiDraftStrategyEnabled}
                  shouldRequestAiStrategy={shouldRequestAiStrategy}
                  strategyRequestKey={`${activeDraftId}:${JSON.stringify(playerPreferences)}:${JSON.stringify(strategyInstructions)}`}
                  onRequestAiStrategy={requestAiDraftStrategy}
                  onAskAboutCandidate={askAboutCandidate}
                  playerPreferences={playerPreferences}
                  showPlaceholderWarning={draftValuesIncomplete}
                  onSetPreference={setPlayerPreference}
                  onClearPreferences={clearPlayerPreferences}
                  onOpenRankings={openDraftPreparation}
                  onOpenSettings={openSettings}
                  onOpenPlayerSearch={() => {
                    draftStrategyOpen = false;
                    selectedDraftTeamId = null;
                    playerSearchOpen = true;
                  }}
                  strategyOpen={draftStrategyOpen}
                  onToggleStrategy={() => {
                    selectedDraftTeamId = null;
                    draftStrategyOpen = !draftStrategyOpen;
                  }}
                />
                <AskManagerPanel
                  onAsk={askManager}
                  onApplyStrategyProposal={(proposal) => addStrategyInstruction(proposal, "ai-chat")}
                  promptRequest={draftQuestionRequest}
                  onOpenSettings={openSettings}
                  providerStatus={conversationalProviderStatus}
                  {hasImportedRankings}
                  {hasSeasonProjections}
                  {hasImportedAdp}
                  showPlaceholderWarning={draftValuesIncomplete}
                  {draftState}
                  draftIdentity={activeDraftIdentity}
                  {recommendation}
                />
              {/if}
            {:else}
              <RosterPanel state={draftState} />
              <PickFeedPanel state={draftState} />
            {/if}
          </div>
          {#if draftValuesIncomplete || emergencyBoardMode}
            <div class="side-column">
              <DraftDataStatus
                hasRankings={hasImportedRankings}
                {rankingsStale}
                hasProjections={hasSeasonProjections}
                hasAdp={hasImportedAdp}
                emergencyMode={emergencyBoardMode}
                onOpen={openDraftPreparation}
              />
            </div>
          {/if}
        </section>
        {#if draftStrategyOpen}
          <DraftStrategyDrawer
            strategy={visibleAiDraftStrategy}
            history={decisionSnapshots.filter((snapshot) => snapshot.trigger === "ai-strategy")}
            isLoadingHistory={isLoadingDecisionHistory}
            historyError={decisionHistoryError}
            instructions={strategyInstructions}
            instructionsBusy={strategyInstructionsBusy}
            instructionsError={strategyInstructionsError}
            onCreateInstruction={addStrategyInstruction}
            onUpdateInstruction={editStrategyInstruction}
            onDeleteInstruction={removeStrategyInstruction}
            onClose={() => (draftStrategyOpen = false)}
          />
        {/if}
        {#if selectedDraftTeamId}
          <DraftTeamDrawer
            state={draftState}
            teamId={selectedDraftTeamId}
            onClose={() => (selectedDraftTeamId = null)}
            onAsk={askAboutDraftTeam}
          />
        {/if}
        {#if playerSearchOpen}
          <PlayerSearchDialog
            state={draftState}
            preferences={playerPreferences}
            onSetPreference={setPlayerPreference}
            onAskAboutPlayer={askAboutSearchedPlayer}
            onClose={() => (playerSearchOpen = false)}
          />
        {/if}
      {:else}
        <TeamRefreshStatus
          lastCheckedAt={teamLastCheckedAt}
          lastChangedAt={teamLastChangedAt}
          isRefreshing={isRefreshingTeamManager}
          error={teamRefreshError}
          onRefresh={() => refreshTeamManagerIfEligible(true)}
        />
        <section class="team-workspace">
          <TeamAskPanel
            teamState={teamManagerState}
            weekContext={teamWeekContext}
            activitySummary={teamActivitySummary}
            onAsk={askTeamManager}
            providerStatus={conversationalProviderStatus}
            promptRequest={teamQuestionRequest}
            onPromptRequestHandled={acknowledgeTeamQuestionRequest}
            onOpenSettings={openSettings}
            onRetryProvider={retryAiProvider}
          />
          <MyTeamPanel
            state={teamManagerState}
            readiness={teamDataReadiness}
            weekContext={teamWeekContext}
            selectedWeek={teamProjectionWeek || null}
            rosSummary={rosRankingSummary}
            weeklySummary={weeklyProjectionSummary}
            error={teamManagerError}
            isLoading={isLoadingTeamManager}
            onManageData={() => (teamDataOpen = true)}
          />
          <TeamActivityPanel activitySummary={teamActivitySummary} isLoading={isLoadingTeamManager} onAsk={askAboutTeamActivity} />
        </section>
        {#if teamDataOpen}
          <TeamDataDrawer
            teamState={teamManagerState}
            readiness={teamDataReadiness}
            rosSummary={rosRankingSummary}
            weeklySummary={weeklyProjectionSummary}
            defaultSeason={weeklyProjectionDefaultSeason}
            defaultWeek={weeklyProjectionDefaultWeek}
            scoring={normalizeDraftScoring(teamManagerState?.league.scoring)}
            rosError={rosRankingError}
            weeklyError={weeklyProjectionError}
            isLoading={isLoadingTeamManager}
            isImportingRos={isImportingRosRankings}
            isClearingRos={isClearingRosRankings}
            isImportingWeekly={isImportingWeeklyProjections}
            isClearingWeekly={isClearingWeeklyProjections}
            onImportRos={importRosRankings}
            onClearRos={clearRosRankings}
            onOpenRos={openFantasyProsRosRankings}
            onImportWeekly={importWeeklyProjections}
            onLoadWeek={loadWeeklyProjectionContext}
            onClearWeekly={clearWeeklyProjections}
            onOpenWeekly={openFantasyProsWeeklyProjections}
            onClose={() => (teamDataOpen = false)}
          />
        {/if}
      {/if}
      {/if}
    {/key}
  {/if}
</main>

<style>
  .app-shell {
    width: auto;
    max-width: 1440px;
    margin: 0 auto;
    padding: var(--space-6);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .app-shell.preconnect-shell {
    max-width: 720px;
    min-height: 100vh;
  }

  .app-shell.preconnect-landing {
    grid-template-rows: auto auto;
    align-content: center;
    gap: var(--space-6);
  }

  .app-shell > *,
  .primary-column,
  .side-column {
    min-width: 0;
  }

  .team-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .connect-editor {
    display: grid;
    justify-items: center;
    margin-bottom: var(--space-5);
  }

  .connect-editor.preconnect {
    align-content: center;
    margin-bottom: 0;
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

  .draft-grid.single-column {
    grid-template-columns: minmax(0, 1fr);
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

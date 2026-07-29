import type { AdpImportPayload, AiConversationMessage, AiDraftStrategyPayload, AiProviderStatus, AppSettings, AskAnswerPayload, CandidateEvaluationPayload, DataMutationPayload, DecisionHistoryPayload, DiagnosticsPayload, ConnectPayload, DraftPayload, DraftRecommendation, DraftScoringFormat, LocalDataCategory, PlayerPreferenceSummary, RankingImportPayload, RecommendationPreferenceRequest, RosRankingImportPayload, SeasonProjectionImportPayload, StorageInventory, TeamAskAnswerPayload, TeamPayload, WeeklyProjectionImportPayload, WeeklyProjectionStatusPayload, Position } from "./types";
import { resolvePackagedApiPort } from "./api-config";

const packagedParameters = window.location.protocol === "file:"
  ? new URLSearchParams(window.location.search)
  : null;
const packagedApiToken = packagedParameters?.get("apiToken") ?? null;
const packagedApiPort = resolvePackagedApiPort(packagedParameters?.get("apiPort") ?? null);
export const apiBase = window.location.protocol === "file:" ? `http://127.0.0.1:${packagedApiPort}` : "/api";
const apiToken = packagedApiToken ?? import.meta.env.VITE_SLEEPER_AI_API_TOKEN ?? "";

if (packagedApiToken) {
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  } catch {
    // The token remains an in-memory capability even if a file URL cannot be rewritten.
  }
}

export type DraftAction = "state" | "events" | "ask" | "strategy" | "recommendations" | "decisions" | "rankings/import" | "projections/season/import" | "adp/import";

export function buildDraftUrl(draftId: string, action: DraftAction, userRosterId: string | null) {
  const query = new URLSearchParams();
  if (userRosterId) {
    query.set("userRosterId", userRosterId);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `${apiBase}/drafts/${encodeURIComponent(draftId)}/${action}${suffix}`;
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({ error: fallback }))) as { error?: string };
  return payload.error ?? fallback;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (apiToken) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }
  return window.fetch(input, { ...init, headers });
}


export async function fetchDiagnostics(): Promise<DiagnosticsPayload> {
  const response = await apiFetch(`${apiBase}/diagnostics`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load diagnostics."));
  }

  return (await response.json()) as DiagnosticsPayload;
}

export async function fetchStorageInventory(): Promise<StorageInventory> {
  const response = await apiFetch(`${apiBase}/data`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load local data details."));
  }
  return (await response.json()) as StorageInventory;
}

export async function fetchSupportReport(): Promise<Record<string, unknown>> {
  const response = await apiFetch(`${apiBase}/data/support-report`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not create the support report."));
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function clearLocalDataCategory(category: LocalDataCategory): Promise<DataMutationPayload> {
  const response = await apiFetch(`${apiBase}/data/${encodeURIComponent(category)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not clear the selected local data."));
  }
  return (await response.json()) as DataMutationPayload;
}

export async function resetLocalData(): Promise<{ settings: AppSettings; inventory: StorageInventory }> {
  const response = await apiFetch(`${apiBase}/data/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "DELETE ALL LOCAL DATA" }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not reset local app data."));
  }
  return (await response.json()) as { settings: AppSettings; inventory: StorageInventory };
}
export async function fetchSettings(): Promise<AppSettings> {
  const response = await apiFetch(`${apiBase}/settings`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load settings."));
  }

  return (await response.json()) as AppSettings;
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const response = await apiFetch(`${apiBase}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not save settings."));
  }

  return (await response.json()) as AppSettings;
}

export async function fetchAiStatus(): Promise<AiProviderStatus> {
  const response = await apiFetch(`${apiBase}/ai/status`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load AI provider status."));
  }

  return (await response.json()) as AiProviderStatus;
}

export async function fetchSleeperConnect(params: {
  username: string;
  season?: string;
  leagueId?: string;
}): Promise<ConnectPayload> {
  const query = new URLSearchParams({ username: params.username });
  if (params.season) {
    query.set("season", params.season);
  }
  if (params.leagueId) {
    query.set("leagueId", params.leagueId);
  }

  const response = await apiFetch(`${apiBase}/sleeper/connect?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Sleeper lookup failed."));
  }

  return (await response.json()) as ConnectPayload;
}

export async function fetchTeamManagerState(
  leagueId: string,
  userRosterId: string | null,
  draftId: string | null = null,
  season: string | null = null,
  week: number | null = null,
): Promise<TeamPayload> {
  const query = new URLSearchParams();
  if (userRosterId) {
    query.set("userRosterId", userRosterId);
  }
  if (draftId) {
    query.set("draftId", draftId);
  }
  if (season) {
    query.set("season", season);
  }
  if (week) {
    query.set("week", String(week));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/team${suffix}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load team roster."));
  }

  return (await response.json()) as TeamPayload;
}
export async function fetchWeeklyProjectionStatus(leagueId: string, season: string, week: number): Promise<WeeklyProjectionStatusPayload> {
  const params = new URLSearchParams({ season, week: String(week) });
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/projections/weekly?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load weekly projection status."));
  }

  return (await response.json()) as WeeklyProjectionStatusPayload;
}

export async function importRosRankingsRequest(input: {
  leagueId: string;
  season: string;
  scoring: DraftScoringFormat;
  csvText: string;
  userRosterId?: string | null;
  draftId?: string | null;
  week?: number | null;
}): Promise<RosRankingImportPayload> {
  const params = new URLSearchParams();
  if (input.userRosterId) params.set("userRosterId", input.userRosterId);
  if (input.draftId) params.set("draftId", input.draftId);
  if (input.week) params.set("week", String(input.week));
  const query = params.toString();
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(input.leagueId)}/rankings/ros/import${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "fantasypros",
      season: input.season,
      scoring: input.scoring,
      csvText: input.csvText,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not import rest-of-season rankings."));
  }
  return (await response.json()) as RosRankingImportPayload;
}

export async function clearRosRankingsRequest(
  leagueId: string,
  season: string,
  scoring: DraftScoringFormat,
): Promise<{ deleted: boolean }> {
  const params = new URLSearchParams({ season, scoring });
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/rankings/ros?${params.toString()}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not clear rest-of-season rankings."));
  }
  return (await response.json()) as { deleted: boolean };
}

export async function importWeeklyProjectionsRequest(input: {
  leagueId: string;
  season: string;
  week: number;
  csvText: string;
  position: Position;
  userRosterId?: string | null;
  draftId?: string | null;
}): Promise<WeeklyProjectionImportPayload> {
  return importWeeklyProjectionFilesRequest({
    ...input,
    files: [{ position: input.position, csvText: input.csvText }],
  });
}

export async function importWeeklyProjectionFilesRequest(input: {
  leagueId: string;
  season: string;
  week: number;
  files: Array<{ position: Position; csvText: string }>;
  userRosterId?: string | null;
  draftId?: string | null;
}): Promise<WeeklyProjectionImportPayload> {
  const params = new URLSearchParams();
  if (input.userRosterId) {
    params.set("userRosterId", input.userRosterId);
  }
  if (input.draftId) {
    params.set("draftId", input.draftId);
  }
  const query = params.toString();
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(input.leagueId)}/projections/weekly/import${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "fantasypros",
      season: input.season,
      week: input.week,
      files: input.files,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not import weekly projections."));
  }

  return (await response.json()) as WeeklyProjectionImportPayload;
}

export async function clearWeeklyProjectionsRequest(leagueId: string, season: string, week: number): Promise<{ deleted: boolean }> {
  const params = new URLSearchParams({ season, week: String(week) });
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/projections/weekly?${params.toString()}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not clear weekly projections."));
  }

  return (await response.json()) as { deleted: boolean };
}

export async function fetchDraftState(
  draftId: string,
  userRosterId: string | null,
  userIdentifier: string | null = null,
): Promise<DraftPayload> {
  const url = new URL(buildDraftUrl(draftId, "state", userRosterId), window.location.origin);
  if (userIdentifier) {
    url.searchParams.set("userIdentifier", userIdentifier);
  }
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Draft load failed."));
  }

  return (await response.json()) as DraftPayload;
}

export async function importRankingsRequest(
  draftId: string,
  userRosterId: string | null,
  csvText: string,
  scoring: string,
): Promise<RankingImportPayload> {
  const response = await apiFetch(buildDraftUrl(draftId, "rankings/import", userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "fantasypros", scoring, csvText }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Ranking import failed."));
  }

  return (await response.json()) as RankingImportPayload;
}

export async function importSeasonProjectionsRequest(input: {
  draftId: string;
  userRosterId: string | null;
  season: string;
  files: Array<{ position: Position; csvText: string }>;
}): Promise<SeasonProjectionImportPayload> {
  const response = await apiFetch(buildDraftUrl(input.draftId, "projections/season/import", input.userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "fantasypros",
      season: input.season,
      files: input.files,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Season projection import failed."));
  }
  return (await response.json()) as SeasonProjectionImportPayload;
}

export async function clearSeasonProjectionsRequest(
  draftId: string,
  userRosterId: string | null,
): Promise<DraftPayload> {
  const response = await apiFetch(buildDraftUrl(draftId, "projections/season/import", userRosterId), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not clear season projections."));
  }
  return (await response.json()) as DraftPayload;
}

export async function importAdpRequest(input: {
  draftId: string;
  userRosterId: string | null;
  season: string;
  csvText: string;
}): Promise<AdpImportPayload> {
  const response = await apiFetch(buildDraftUrl(input.draftId, "adp/import", input.userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "fantasypros",
      season: input.season,
      csvText: input.csvText,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Sleeper ADP import failed."));
  }
  return (await response.json()) as AdpImportPayload;
}

export async function clearAdpRequest(
  draftId: string,
  userRosterId: string | null,
): Promise<DraftPayload> {
  const response = await apiFetch(buildDraftUrl(draftId, "adp/import", userRosterId), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not clear Sleeper ADP."));
  }
  return (await response.json()) as DraftPayload;
}

export async function clearRankingsRequest(draftId: string, userRosterId: string | null): Promise<DraftPayload> {
  const response = await apiFetch(buildDraftUrl(draftId, "rankings/import", userRosterId), {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not clear imported rankings."));
  }

  return (await response.json()) as DraftPayload;
}

export async function fetchDraftRecommendationRequest(
  draftId: string,
  userRosterId: string | null,
  recommendationPreferences: RecommendationPreferenceRequest,
): Promise<DraftRecommendation> {
  const response = await apiFetch(buildDraftUrl(draftId, "recommendations", userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recommendationPreferences }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not refresh recommendations."));
  }

  return (await response.json()) as DraftRecommendation;
}

export async function fetchDecisionHistory(
  draftId: string,
  userRosterId: string | null,
  limit = 12,
): Promise<DecisionHistoryPayload> {
  const url = new URL(buildDraftUrl(draftId, "decisions", userRosterId), window.location.href);
  url.searchParams.set("limit", String(limit));
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load recommendation history."));
  }
  return (await response.json()) as DecisionHistoryPayload;
}

export async function evaluateDraftCandidateRequest(
  draftId: string,
  userRosterId: string | null,
  playerId: string,
  recommendationPreferences: RecommendationPreferenceRequest,
): Promise<CandidateEvaluationPayload> {
  const query = new URLSearchParams();
  if (userRosterId) {
    query.set("userRosterId", userRosterId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiFetch(
    `${apiBase}/drafts/${encodeURIComponent(draftId)}/candidates/${encodeURIComponent(playerId)}/evaluate${suffix}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationPreferences }),
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not evaluate this candidate."));
  }
  return (await response.json()) as CandidateEvaluationPayload;
}

export async function fetchAiDraftStrategyRequest(
  draftId: string,
  userRosterId: string | null,
  userPreferences: PlayerPreferenceSummary,
  recommendationPreferences: RecommendationPreferenceRequest,
): Promise<AiDraftStrategyPayload> {
  const response = await apiFetch(buildDraftUrl(draftId, "strategy", userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userPreferences, recommendationPreferences }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "The AI strategist could not evaluate this board."));
  }
  return (await response.json()) as AiDraftStrategyPayload;
}

export async function askManagerRequest(
  draftId: string,
  userRosterId: string | null,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  userPreferences: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] },
  recommendationPreferences: RecommendationPreferenceRequest = { pinnedPlayerIds: [], fadedPlayerIds: [], excludedPlayerIds: [] },
): Promise<AskAnswerPayload> {
  const response = await apiFetch(buildDraftUrl(draftId, "ask", userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, conversationHistory, userPreferences, recommendationPreferences }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "The manager could not answer because the draft state is unavailable."));
  }

  return (await response.json()) as AskAnswerPayload;
}

export function createDraftEventSource(draftId: string, userRosterId: string | null): EventSource {
  const url = new URL(buildDraftUrl(draftId, "events", userRosterId), window.location.href);
  if (apiToken) {
    url.searchParams.set("apiToken", apiToken);
  }
  return new EventSource(url.toString());
}








export async function askTeamManagerRequest(
  leagueId: string,
  userRosterId: string | null,
  draftId: string | null,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  season: string | null = null,
  week: number | null = null,
): Promise<TeamAskAnswerPayload> {
  const query = new URLSearchParams();
  if (userRosterId) {
    query.set("userRosterId", userRosterId);
  }
  if (draftId) {
    query.set("draftId", draftId);
  }
  if (season) {
    query.set("season", season);
  }
  if (week) {
    query.set("week", String(week));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiFetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/team/ask${suffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, conversationHistory }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "The manager could not answer because team context is unavailable."));
  }

  return (await response.json()) as TeamAskAnswerPayload;
}



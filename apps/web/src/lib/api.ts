import type { AiConversationMessage, AiProviderStatus, AppSettings, AskAnswerPayload, ConnectPayload, DraftPayload, DraftRecommendation, ExperimentalCodexAuthStatus, PlayerPreferenceSummary, RankingImportPayload, RecommendationPreferenceRequest, TeamAskAnswerPayload, TeamManagerState } from "./types";

export const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:8787" : "/api";

export type DraftAction = "state" | "events" | "ask" | "recommendations" | "rankings/import";

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

export async function fetchSettings(): Promise<AppSettings> {
  const response = await fetch(`${apiBase}/settings`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load settings."));
  }

  return (await response.json()) as AppSettings;
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const response = await fetch(`${apiBase}/settings`, {
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
  const response = await fetch(`${apiBase}/ai/status`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load AI provider status."));
  }

  return (await response.json()) as AiProviderStatus;
}

export async function fetchExperimentalCodexStatus(): Promise<ExperimentalCodexAuthStatus> {
  const response = await fetch(`${apiBase}/ai/experimental-codex/status`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load Codex auth status."));
  }

  return (await response.json()) as ExperimentalCodexAuthStatus;
}

export async function startExperimentalCodexLogin(): Promise<ExperimentalCodexAuthStatus> {
  const response = await fetch(`${apiBase}/ai/experimental-codex/auth/start`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not start Codex login."));
  }

  return (await response.json()) as ExperimentalCodexAuthStatus;
}

export async function pollExperimentalCodexLogin(status?: ExperimentalCodexAuthStatus): Promise<ExperimentalCodexAuthStatus> {
  const response = await fetch(`${apiBase}/ai/experimental-codex/auth/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceAuthId: status?.deviceAuthId, userCode: status?.userCode }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not poll Codex login."));
  }

  return (await response.json()) as ExperimentalCodexAuthStatus;
}

export async function logoutExperimentalCodex(): Promise<ExperimentalCodexAuthStatus> {
  const response = await fetch(`${apiBase}/ai/experimental-codex/logout`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not log out of Codex."));
  }

  return (await response.json()) as ExperimentalCodexAuthStatus;
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

  const response = await fetch(`${apiBase}/sleeper/connect?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Sleeper lookup failed."));
  }

  return (await response.json()) as ConnectPayload;
}

export async function fetchTeamManagerState(leagueId: string, userRosterId: string | null): Promise<TeamManagerState> {
  const query = new URLSearchParams();
  if (userRosterId) {
    query.set("userRosterId", userRosterId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await fetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/team${suffix}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load team roster."));
  }

  return (await response.json()) as TeamManagerState;
}
export async function fetchDraftState(draftId: string, userRosterId: string | null): Promise<DraftPayload> {
  const response = await fetch(buildDraftUrl(draftId, "state", userRosterId));
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Draft load failed."));
  }

  return (await response.json()) as DraftPayload;
}

export async function importRankingsRequest(
  draftId: string,
  userRosterId: string | null,
  csvText: string,
): Promise<RankingImportPayload> {
  const response = await fetch(buildDraftUrl(draftId, "rankings/import", userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "fantasypros", csvText }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Ranking import failed."));
  }

  return (await response.json()) as RankingImportPayload;
}

export async function clearRankingsRequest(draftId: string, userRosterId: string | null): Promise<DraftPayload> {
  const response = await fetch(buildDraftUrl(draftId, "rankings/import", userRosterId), {
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
  const response = await fetch(buildDraftUrl(draftId, "recommendations", userRosterId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recommendationPreferences }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not refresh recommendations."));
  }

  return (await response.json()) as DraftRecommendation;
}
export async function askManagerRequest(
  draftId: string,
  userRosterId: string | null,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  userPreferences: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] },
  recommendationPreferences: RecommendationPreferenceRequest = { pinnedPlayerIds: [], fadedPlayerIds: [], excludedPlayerIds: [] },
): Promise<AskAnswerPayload> {
  const response = await fetch(buildDraftUrl(draftId, "ask", userRosterId), {
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
  return new EventSource(buildDraftUrl(draftId, "events", userRosterId));
}








export async function askTeamManagerRequest(
  leagueId: string,
  userRosterId: string | null,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
): Promise<TeamAskAnswerPayload> {
  const query = new URLSearchParams();
  if (userRosterId) {
    query.set("userRosterId", userRosterId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await fetch(`${apiBase}/leagues/${encodeURIComponent(leagueId)}/team/ask${suffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, conversationHistory }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "The manager could not answer because team context is unavailable."));
  }

  return (await response.json()) as TeamAskAnswerPayload;
}

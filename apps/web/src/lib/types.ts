import type { AppSettings, CandidateSignal, DraftRecommendation, DraftState, Position, RankingImportSummary } from "@sleeper-ai/shared";

export type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
};

export type RankingImportPayload = DraftPayload & {
  summary: RankingImportSummary;
};

export type ConnectDraft = {
  draftId: string;
  name: string;
  status: string;
  type: string;
  season: string | null;
  teams: number | null;
  rounds: number | null;
  userDraftSlot: number | null;
};

export type ConnectLeague = {
  leagueId: string;
  name: string;
  season: string | null;
  status: string;
  totalRosters: number | null;
  scoring: string;
  rosterSlots: Record<string, number>;
  userRosterId: string | null;
  drafts: ConnectDraft[];
  recommendedDraftId: string | null;
};

export type ConnectPayload = {
  user: {
    userId: string;
    username: string | null;
    displayName: string | null;
  };
  season: string;
  leagues: ConnectLeague[];
};



export type PlayerPreferenceLevel = "pin" | "fade" | "exclude";

export type PlayerPreferences = Record<string, PlayerPreferenceLevel>;


export type RecommendationPreferenceRequest = {
  pinnedPlayerIds: string[];
  fadedPlayerIds: string[];
  excludedPlayerIds: string[];
};
export type PlayerPreferenceSummary = {
  pinned: string[];
  faded: string[];
  excluded: string[];
};
export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
export type AskAnswerPayload = {
  answer: string;
  recommendation: DraftRecommendation;
};

export type Tone = "ready" | "warning" | "blocked" | "neutral";

export type ReadinessItem = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

export type ExperimentalCodexAuthStatus = {
  authenticated: boolean;
  verificationUri?: string;
  userCode?: string;
  deviceAuthId?: string;
  interval?: number;
  pending?: boolean;
  error?: string;
};

export type AiProviderStatus = {
  id: AppSettings["aiProvider"];
  label: string;
  configured: boolean;
  experimental?: boolean;
  detail?: string;
};

export type { AppSettings, CandidateSignal, DraftRecommendation, DraftState, Position, RankingImportSummary };





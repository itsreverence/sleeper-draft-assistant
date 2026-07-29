import type { AiDraftDecision, DraftRecommendation, DraftState, Position, TeamActivitySummary, TeamDataReadiness, TeamLineupSummary, TeamManagerState, TeamNeedsSummary, TeamWaiverSummary, TeamWeekContext } from "@sleeper-draft-assistant/shared";

export type AiProviderId = "noop" | "codex-app-server";

export type AiProviderStatus = {
  id: AiProviderId;
  label: string;
  configured: boolean;
  experimental?: boolean;
  detail?: string;
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

export type DraftAiContext = {
  task: "draft_question" | "draft_strategy";
  question: string;
  conversationHistory: AiConversationMessage[];
  userPreferences: PlayerPreferenceSummary;
  dataQuality: {
    playerValueSource: string;
    hasImportedRankings: boolean;
    hasSeasonProjections: boolean;
    usesSleeperPlaceholderRanks: boolean;
    limitations: string[];
  };
  draftBrief: {
    leagueFormat: string;
    currentPick: string;
    userRoster: string;
    engineLean: string;
    primaryDecisionGuidance: string[];
    rosterPressure: string[];
    candidateTradeoffs: string[];
    dataWarnings: string[];
    responseRules: string[];
  };
  draft: {
    id: string;
    name: string;
    status: DraftState["status"];
    currentPick: number;
    updatedAt: string;
  };
  settings: DraftState["settings"];
  rosterConstruction: {
    rosterCounts: Record<Position, number>;
    startingSlots: Record<string, number>;
    flexSlots: number;
    superFlexSlots: number;
    draftedFlexEligible: number;
    rbWrDemand: number;
    rbWrRostered: number;
    primaryNeeds: Position[];
    pressureSignals: string[];
    note: string;
  };
  userTeam: {
    id: string;
    name: string;
    draftSlot: number;
    roster: Array<{
      id: string;
      name: string;
      team: string;
      position: string;
    }>;
  } | null;
  recentPicks: Array<{
    pickNo: number;
    round: number;
    team: string;
    player: string;
  }>;
  recommendation: {
    headline: string;
    confidence: DraftRecommendation["confidence"];
    summary: string;
    candidates: Array<{
      playerId: string;
      name: string;
      team: string;
      position: string;
      score: number;
      rosterFit: string;
      value: string;
      scarcity: string;
      returnProbability: number;
      reasons: string[];
      source: string;
      importedRank?: number | null;
      seasonProjectedPoints?: number | null;
      sleeperAdp?: number | null;
      realTimeAdp?: number | null;
      tier?: number | null;
      byeWeek?: number | null;
      riskTags: string[];
    }>;
    risks: string[];
    assumptions: string[];
  };
};


export type TeamAiContext = {
  task: "team_question";
  question: string;
  conversationHistory: AiConversationMessage[];
  teamNeeds: TeamNeedsSummary;
  lineupSummary: TeamLineupSummary;
  teamBrief: {
    leagueFormat: string;
    teamName: string;
    week: string;
    rosterSummary: string;
    lineupStatus: string;
    lineupFacts: string[];
    lineupDecisions: string[];
    dataReadinessFacts: string[];
    openStarterSlots: string[];
    depthSignals: string[];
    deterministicFacts: string[];
    matchupFacts: string[];
    waiverFacts: string[];
    topWaiverCandidates: string[];
    topDropCandidates: string[];
    activityFacts: string[];
    recentTransactions: string[];
    trendingAdds: string[];
    trendingDrops: string[];
    opponent: string | null;
    weakestPositions: Position[];
    starterCandidates: string[];
    benchPlayers: string[];
    dataWarnings: string[];
    responseRules: string[];
  };
  teamState: TeamManagerState;
  dataReadiness: TeamDataReadiness | null;
  weekContext: TeamWeekContext | null;
  waiverSummary: TeamWaiverSummary;
  activitySummary: TeamActivitySummary;
};

export type AiAnswer = {
  provider: AiProviderStatus;
  answer: string;
};

export type AiDraftStrategy = {
  provider: AiProviderStatus;
  decision: AiDraftDecision;
};

export interface AiProvider {
  status(): AiProviderStatus;
  strategizeDraft(context: DraftAiContext): Promise<AiDraftStrategy>;
  answerDraftQuestion(context: DraftAiContext): Promise<AiAnswer>;
  answerTeamQuestion(context: TeamAiContext): Promise<AiAnswer>;
}











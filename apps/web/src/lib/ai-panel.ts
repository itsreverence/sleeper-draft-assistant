import type {
  AiProviderStatus,
  AiDraftStrategyPayload,
  DraftRecommendation,
  DraftState,
  Position,
} from "./types";

export type AiPanelContextSummary = {
  league: string;
  starters: string;
  data: string;
  note: string | null;
};

export type SuggestedQuestion = {
  label: string;
  prompt: string;
};

export function buildCandidateDiscussionQuestion(
  playerName: string,
  recommendedPlayerName: string,
): string {
  if (playerName === recommendedPlayerName) {
    return `The current AI strategy recommends ${recommendedPlayerName}. Should I draft ${playerName} with this pick? Validate that choice against the strongest available alternatives.`;
  }
  return `The current AI strategy recommends ${recommendedPlayerName}. Should I draft ${playerName} instead? Compare both players with the strongest available alternatives.`;
}

export function currentAiDraftStrategy(
  strategy: AiDraftStrategyPayload | null,
  currentPick: number,
): AiDraftStrategyPayload | null {
  return strategy?.pickNumber === currentPick ? strategy : null;
}

export function shouldRequestAiDraftStrategy(
  state: DraftState | null,
  providerStatus: AiProviderStatus | null,
  picksUntilTurn: number | null,
): boolean {
  if (
    state?.status === "complete" ||
    providerStatus?.id !== "codex-app-server" ||
    !providerStatus.configured
  ) {
    return false;
  }
  return state?.status === "pre_draft" ||
    (state?.status === "drafting" && picksUntilTurn !== null && picksUntilTurn <= 2);
}

export function buildSuggestedQuestions(
  state: DraftState | null,
  _currentRecommendation: DraftRecommendation | null,
  rankingsImported: boolean,
  usingPlaceholderRanks: boolean,
): SuggestedQuestion[] {
  const fallback: SuggestedQuestion[] = [
    { label: "Best pick now", prompt: "Who should I draft if I pick right now?" },
    { label: "Compare top options", prompt: "Compare my top 3 options." },
    { label: "QB priority?", prompt: "Should I prioritize QB here?" },
    { label: "Biggest roster need", prompt: "What roster need matters most?" },
  ];

  if (!state) {
    return fallback;
  }

  const rosterNeeds = getRosterNeeds(state);
  const questions: SuggestedQuestion[] = [
    { label: "Best pick now", prompt: "Who should I draft if I pick right now?" },
    { label: "Compare best options", prompt: "Search the available players and compare the best options." },
  ];

  if (getFlexSlotCount(state) > 0) {
    questions.push({ label: "Best RB/WR fit", prompt: "Which RB/WR fits this build best?" });
  }

  if (hasSingleQbFormat(state)) {
    questions.push({ label: "Pass on QB?", prompt: "Should I pass on QB in this format?" });
  }

  if (rosterNeeds.length > 0) {
    questions.push({
      label: "Need vs. value",
      prompt: `Should I prioritize ${formatPositionList(rosterNeeds)} or take the best available value?`,
    });
  }

  if (usingPlaceholderRanks) {
    questions.push({ label: "Trust Sleeper ranks?", prompt: "How much should I trust these placeholder Sleeper ranks?" });
  } else if (rankingsImported) {
    questions.push({ label: "Ranking uncertainty", prompt: "Where are imported rankings weakest for this decision?" });
  }

  if (rosterNeeds.length > 0) {
    questions.push({ label: "Need after this pick", prompt: "What roster need matters most after this pick?" });
  } else {
    questions.push({ label: "Next-round target", prompt: "What position should I target next round?" });
  }

  return uniqueSuggestedQuestions(questions).slice(0, 6);
}

export function buildAiPanelContextSummary(
  state: DraftState | null,
  _currentRecommendation: DraftRecommendation | null,
  rankingsImported: boolean,
  projectionsImported: boolean,
  adpImported: boolean,
  usingPlaceholderRanks: boolean,
): AiPanelContextSummary {
  if (!state) {
    return {
      league: "No draft loaded",
      starters: "Not available",
      data: "Not available",
      note: null,
    };
  }

  const dataSources: string[] = [];
  if (rankingsImported) dataSources.push("ECR");
  if (projectionsImported) dataSources.push("Season projections");
  if (adpImported) dataSources.push("Sleeper ADP");
  if (usingPlaceholderRanks) dataSources.push("Sleeper placeholder ranks");
  if (dataSources.length === 0) dataSources.push("Demo values");

  const note = usingPlaceholderRanks
    ? "AI receives the current board, roster, and league settings, but player values are temporary Sleeper search ranks."
    : "AI receives the current board, roster, league settings, and the imported player-value sources shown above.";

  return {
    league: `${state.settings.scoring.toUpperCase()} · ${state.settings.teams} teams`,
    starters: formatStarterSlots(state.settings.rosterSlots),
    data: uniqueQuestions(dataSources).join(" · "),
    note,
  };
}

export function buildPlayerDiscussionQuestion(playerName: string): string {
  return `Evaluate ${playerName} for my current pick. Compare them with the strongest available alternatives and explain whether I should draft them now, wait, deprioritize them, or exclude them.`;
}

function getRosterNeeds(state: DraftState): Position[] {
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  const playersById = new Map(state.players.map((player) => [player.id, player]));

  for (const playerId of userTeam?.roster ?? []) {
    const player = playersById.get(playerId);
    if (player) {
      counts[player.position] += 1;
    }
  }

  return (["QB", "RB", "WR", "TE"] as Position[]).filter((position) => counts[position] < (state.settings.rosterSlots[position] ?? 0));
}

function hasSingleQbFormat(state: DraftState): boolean {
  return (state.settings.rosterSlots.QB ?? 0) <= 1 && (state.settings.rosterSlots.SUPER_FLEX ?? 0) === 0;
}

function formatPositionList(positions: Position[]): string {
  if (positions.length === 0) {
    return "roster need";
  }
  if (positions.length === 1) {
    return positions[0];
  }
  return `${positions.slice(0, -1).join("/")}/${positions[positions.length - 1]}`;
}

function getFlexSlotCount(state: DraftState): number {
  return (state.settings.rosterSlots.FLEX ?? 0) +
    (state.settings.rosterSlots.WR_RB_FLEX ?? 0) +
    (state.settings.rosterSlots.REC_FLEX ?? 0);
}

function uniqueQuestions(source: string[]): string[] {
  return Array.from(new Set(source.filter(Boolean)));
}

function formatStarterSlots(rosterSlots: Record<string, number>): string {
  const slotGroups = [
    { label: "QB", keys: ["QB"] },
    { label: "RB", keys: ["RB"] },
    { label: "WR", keys: ["WR"] },
    { label: "TE", keys: ["TE"] },
    { label: "FLEX", keys: ["FLEX", "WR_RB_FLEX", "REC_FLEX"] },
    { label: "SUPER FLEX", keys: ["SUPER_FLEX", "SF"] },
    { label: "K", keys: ["K"] },
    { label: "DEF", keys: ["DEF", "DST"] },
  ];
  const ignoredSlots = new Set(["BN", "BENCH", "IR", "RESERVE", "TAXI"]);
  const consumedSlots = new Set(slotGroups.flatMap((group) => group.keys));
  const formatted = slotGroups
    .map((group) => ({
      label: group.label,
      count: group.keys.reduce((total, key) => total + (rosterSlots[key] ?? 0), 0),
    }))
    .filter((slot) => slot.count > 0)
    .map((slot) => `${slot.count} ${slot.label}`);

  const otherStarters = Object.entries(rosterSlots)
    .filter(([key, count]) => count > 0 && !consumedSlots.has(key) && !ignoredSlots.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${count} ${key.replaceAll("_", " ")}`);

  return [...formatted, ...otherStarters].join(" · ") || "Not available";
}

function uniqueSuggestedQuestions(source: SuggestedQuestion[]): SuggestedQuestion[] {
  return source.filter((question, index) => question.prompt && source.findIndex((candidate) => candidate.prompt === question.prompt) === index);
}


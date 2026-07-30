import type {
  AiProviderStatus,
  AiDraftStrategyPayload,
  DraftRecommendation,
  DraftState,
  Position,
} from "./types";

export type AiPanelContextSummary = {
  chips: string[];
  note: string | null;
};

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
): string[] {
  const fallback = [
    "Who should I draft if I pick right now?",
    "Compare my top 3 options.",
    "Should I prioritize QB here?",
    "What roster need matters most?",
  ];

  if (!state) {
    return fallback;
  }

  const rosterNeeds = getRosterNeeds(state);
  const questions: string[] = [
    "Who should I draft if I pick right now?",
    "Search the available players and compare the best options.",
  ];

  if (getFlexSlotCount(state) > 0) {
    questions.push("Which RB/WR fits this build best?");
  }

  if (hasSingleQbFormat(state)) {
    questions.push("Should I pass on QB in this format?");
  }

  if (rosterNeeds.length > 0) {
    questions.push(`Should I prioritize ${formatPositionList(rosterNeeds)} or take the best available value?`);
  }

  if (usingPlaceholderRanks) {
    questions.push("How much should I trust these placeholder Sleeper ranks?");
  } else if (rankingsImported) {
    questions.push("Where are imported rankings weakest for this decision?");
  }

  if (rosterNeeds.length > 0) {
    questions.push("What roster need matters most after this pick?");
  } else {
    questions.push("What position should I target next round?");
  }

  return uniqueQuestions(questions).slice(0, 6);
}

export function buildAiPanelContextSummary(
  state: DraftState | null,
  _currentRecommendation: DraftRecommendation | null,
  rankingsImported: boolean,
  usingPlaceholderRanks: boolean,
): AiPanelContextSummary {
  if (!state) {
    return { chips: ["No draft loaded"], note: null };
  }

  const chips = [state.settings.scoring, formatFlexChip(state), rankingsImported ? "Imported rankings" : usingPlaceholderRanks ? "Sleeper placeholder ranks" : "Demo values"];
  if (getFlexSlotCount(state) > 0) {
    chips.push("RB/WR flex pressure");
  }
  if (hasSingleQbFormat(state)) {
    chips.push("Lower QB pressure");
  }

  const note = usingPlaceholderRanks
    ? "AI answers are grounded in Sleeper draft context, but player values are placeholder ranks."
    : rankingsImported
      ? "AI answers are grounded in Sleeper draft context and imported rankings, not live projections."
      : "AI answers are grounded in the current draft context.";

  return { chips: uniqueQuestions(chips).slice(0, 5), note };
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

function formatFlexChip(state: DraftState): string {
  const flexSlots = getFlexSlotCount(state);
  const superFlexSlots = (state.settings.rosterSlots.SUPER_FLEX ?? 0) + (state.settings.rosterSlots.SF ?? 0);
  const parts: string[] = [];

  if (flexSlots > 0) {
    parts.push(`${flexSlots} FLEX`);
  }
  if (superFlexSlots > 0) {
    parts.push(`${superFlexSlots} SUPER_FLEX`);
  }

  return parts.length > 0 ? parts.join(" / ") : "No flex";
}

function getFlexSlotCount(state: DraftState): number {
  return (state.settings.rosterSlots.FLEX ?? 0) +
    (state.settings.rosterSlots.WR_RB_FLEX ?? 0) +
    (state.settings.rosterSlots.REC_FLEX ?? 0);
}

function uniqueQuestions(source: string[]): string[] {
  return Array.from(new Set(source.filter(Boolean)));
}


import type {
  AiProviderStatus,
  AiDraftStrategyPayload,
  CandidateSignal,
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
  currentRecommendation: DraftRecommendation | null,
  rankingsImported: boolean,
  usingPlaceholderRanks: boolean,
): string[] {
  const fallback = [
    "Who should I draft if I pick right now?",
    "Compare my top 3 options.",
    "Should I prioritize QB here?",
    "What roster need matters most?",
  ];

  if (!state || !currentRecommendation?.candidates.length) {
    return fallback;
  }

  const candidates = currentRecommendation.candidates;
  const top = candidates[0];
  const second = candidates[1];
  const third = candidates[2];
  const rosterNeeds = getRosterNeeds(state);
  const questions: string[] = [];

  if (top) {
    questions.push(`Why is ${top.player.name} the recommendation?`);
  }

  if (hasReason(candidates, "matches RB/WR flex demand")) {
    questions.push("Which RB/WR fits this build best?");
  }

  if (hasReason(candidates, "shallow league reduces replacement pressure")) {
    questions.push("Should I pass on QB in this format?");
  }

  if (top && second) {
    questions.push(`Compare ${top.player.name} vs ${second.player.name}.`);
  }

  if (top?.player.position === "QB" && hasSingleQbFormat(state)) {
    questions.push(`Should I take ${top.player.name} this early in a 1QB format?`);
  } else if (rosterNeeds.length > 0) {
    questions.push(`Should I prioritize ${formatPositionList(rosterNeeds)} over ${top?.player.position ?? "the top player"}?`);
  }

  const highReturn = candidates.find((candidate) => candidate.returnProbability >= 0.45 && candidate.player.name !== top?.player.name);
  if (highReturn) {
    questions.push(`Can I wait on ${highReturn.player.name}?`);
  } else if (third) {
    questions.push(`What changes if I pass on ${top?.player.name} for ${third.player.name}?`);
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
  currentRecommendation: DraftRecommendation | null,
  rankingsImported: boolean,
  usingPlaceholderRanks: boolean,
): AiPanelContextSummary {
  if (!state) {
    return { chips: ["No draft loaded"], note: null };
  }

  const chips = [state.settings.scoring, formatFlexChip(state), rankingsImported ? "Imported rankings" : usingPlaceholderRanks ? "Sleeper placeholder ranks" : "Demo values"];
  const candidateReasons = currentRecommendation?.candidates.flatMap((candidate) => candidate.reasons) ?? [];

  if (candidateReasons.includes("matches RB/WR flex demand")) {
    chips.push("RB/WR flex pressure");
  }
  if (candidateReasons.includes("shallow league reduces replacement pressure")) {
    chips.push("Lower QB pressure");
  }

  const note = usingPlaceholderRanks
    ? "AI answers are grounded in Sleeper draft context, but player values are placeholder ranks."
    : rankingsImported
      ? "AI answers are grounded in Sleeper draft context and imported rankings, not live projections."
      : "AI answers are grounded in the current draft context.";

  return { chips: uniqueQuestions(chips).slice(0, 5), note };
}

function hasReason(candidates: CandidateSignal[], reason: string): boolean {
  return candidates.some((candidate) => candidate.reasons.includes(reason));
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
  const flexSlots = (state.settings.rosterSlots.FLEX ?? 0) + (state.settings.rosterSlots.WR_RB_FLEX ?? 0) + (state.settings.rosterSlots.REC_FLEX ?? 0);
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

function uniqueQuestions(source: string[]): string[] {
  return Array.from(new Set(source.filter(Boolean)));
}


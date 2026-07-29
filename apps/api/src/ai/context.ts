import type { DraftState, Player, Position } from "@sleeper-draft-assistant/shared";

import { buildGroupedPlayerEvidence, createDraftPlayerSnapshot, toDraftPlayerEvidence, type DraftPlayerSnapshot } from "./draft-tools";
import type { AiConversationMessage, DraftQuestionContext, DraftStrategyContext, PlayerPreferenceSummary } from "./types";

export function buildDraftStrategyContext(
  state: DraftState,
  userPreferences: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] },
  snapshot: DraftPlayerSnapshot = createDraftPlayerSnapshot(state, userPreferences),
): DraftStrategyContext {
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  if (!userTeam) {
    throw new Error("The user's draft team is not available.");
  }
  const positionCounts = countRosterPositions(userTeam, playersById);
  const openDirectStarterSlots = getOpenDirectStarterSlots(state, positionCounts);
  const nextUserPick = findNextUserPick(state);
  const recentPicks = [...state.picks].reverse().slice(0, 12);
  const availablePlayers = snapshot.players.filter((player) => !snapshot.preferences.excluded.has(player.id));
  const groupedPlayerEvidence = buildGroupedPlayerEvidence(snapshot, openDirectStarterSlots);

  return {
    task: "draft_strategy",
    objective: "Choose the best available player for the user's roster at the current pick.",
    userPreferences,
    dataQuality: {
      availablePlayers: availablePlayers.length,
      rankedPlayers: availablePlayers.filter((player) => player.importedRank != null).length,
      projectedPlayers: availablePlayers.filter((player) => player.seasonProjectedPoints != null || player.projectionSource === "season_projection").length,
      sleeperAdpPlayers: availablePlayers.filter((player) => Boolean(player.adpSource) && player.adp != null).length,
      realTimeAdpPlayers: availablePlayers.filter((player) => player.realTimeAdp != null).length,
      usesSleeperPlaceholderRanks: availablePlayers.some((player) => player.projectionSource === "sleeper_search_rank"),
      formatWarnings: state.settings.formatCompatibility?.warnings ?? [],
    },
    draft: {
      id: state.id,
      name: state.name,
      status: state.status,
      currentPick: state.currentPick,
      nextUserPick,
      picksUntilNextUserPick: nextUserPick === null ? null : nextUserPick - state.currentPick,
      remainingUserSelections: countUserPicksFrom(state, state.currentPick),
      updatedAt: state.updatedAt,
    },
    settings: state.settings,
    roster: {
      teamId: userTeam.id,
      teamName: userTeam.name,
      draftSlot: userTeam.draftSlot,
      positionCounts,
      openDirectStarterSlots,
      openFlexSlots: getOpenFlexSlots(state, positionCounts),
      openSuperFlexSlots: getOpenSuperFlexSlots(state, positionCounts),
      players: userTeam.roster.flatMap((playerId) => {
        const player = playersById.get(playerId);
        return player ? [{
          playerId,
          name: player.name,
          team: player.team,
          position: player.position,
          byeWeek: player.byeWeek ?? null,
        }] : [];
      }),
    },
    board: {
      recentPicks: recentPicks.map((pick) => ({
        pickNo: pick.pickNo,
        round: pick.round,
        team: teamsById.get(pick.teamId)?.name ?? pick.teamId,
        player: playersById.get(pick.playerId)?.name ?? pick.playerId,
        position: playersById.get(pick.playerId)?.position ?? null,
      })),
      draftedByPosition: countPickedPositions(state.picks, playersById),
      recentDraftedByPosition: countPickedPositions(recentPicks, playersById),
      availableByPosition: countPlayerPositions(availablePlayers),
      teamsSelectingBeforeNextTurn: getTeamsSelectingBeforeNextTurn(state, nextUserPick, playersById),
    },
    ...groupedPlayerEvidence,
  };
}

export function buildDraftQuestionContext(
  state: DraftState,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  userPreferences: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] },
  snapshot: DraftPlayerSnapshot = createDraftPlayerSnapshot(state, userPreferences),
  focusPlayerIds: string[] = [],
): DraftQuestionContext {
  const { task: _task, objective: _objective, ...evidence } = buildDraftStrategyContext(
    state,
    userPreferences,
    snapshot,
  );
  const playersById = new Map(snapshot.players.map((player) => [player.id, player]));

  return {
    ...evidence,
    task: "draft_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    focusPlayers: focusPlayerIds.flatMap((playerId) => {
      const player = playersById.get(playerId);
      return player ? [toDraftPlayerEvidence(player, snapshot)] : [];
    }),
  };
}

function getOpenDirectStarterSlots(
  state: DraftState,
  counts: Record<Position, number>,
): Record<Position, number> {
  const slots = state.settings.rosterSlots;
  return {
    QB: Math.max(0, (slots.QB ?? 0) - counts.QB),
    RB: Math.max(0, (slots.RB ?? 0) - counts.RB),
    WR: Math.max(0, (slots.WR ?? 0) - counts.WR),
    TE: Math.max(0, (slots.TE ?? 0) - counts.TE),
    K: Math.max(0, (slots.K ?? 0) - counts.K),
    DEF: Math.max(0, (slots.DEF ?? 0) - counts.DEF),
  };
}

function getOpenSuperFlexSlots(state: DraftState, counts: Record<Position, number>): number {
  const slots = state.settings.rosterSlots;
  const superFlexSlots = (slots.SUPER_FLEX ?? 0) + (slots.SF ?? 0);
  const regularFlexSlots = (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
  const rbWrTeSurplus =
    Math.max(0, counts.RB - (slots.RB ?? 0)) +
    Math.max(0, counts.WR - (slots.WR ?? 0)) +
    Math.max(0, counts.TE - (slots.TE ?? 0));
  const qbSurplus = Math.max(0, counts.QB - (slots.QB ?? 0));
  const surplusAfterRegularFlex = qbSurplus + Math.max(0, rbWrTeSurplus - regularFlexSlots);
  return Math.max(0, superFlexSlots - surplusAfterRegularFlex);
}

function getOpenFlexSlots(state: DraftState, counts: Record<Position, number>): number {
  const slots = state.settings.rosterSlots;
  const flexSlots = (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
  const surplus =
    Math.max(0, counts.RB - (slots.RB ?? 0)) +
    Math.max(0, counts.WR - (slots.WR ?? 0)) +
    Math.max(0, counts.TE - (slots.TE ?? 0));
  return Math.max(0, flexSlots - surplus);
}

function findNextUserPick(state: DraftState): number | null {
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot;
  if (!userSlot) {
    return null;
  }
  const currentSlot = draftSlotForPick(state.currentPick, state.settings.teams);
  const start = currentSlot === userSlot ? state.currentPick + 1 : state.currentPick;
  const totalPicks = state.settings.teams * state.settings.rounds;
  for (let pickNo = start; pickNo <= totalPicks; pickNo += 1) {
    if (draftSlotForPick(pickNo, state.settings.teams) === userSlot) {
      return pickNo;
    }
  }
  return null;
}

function countUserPicksFrom(state: DraftState, fromPick: number): number {
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot;
  if (!userSlot) {
    return 0;
  }
  let count = 0;
  for (let pickNo = fromPick; pickNo <= state.settings.teams * state.settings.rounds; pickNo += 1) {
    if (draftSlotForPick(pickNo, state.settings.teams) === userSlot) {
      count += 1;
    }
  }
  return count;
}

function draftSlotForPick(pickNo: number, teams: number): number {
  const round = Math.ceil(pickNo / teams);
  const pickInRound = ((pickNo - 1) % teams) + 1;
  return round % 2 === 1 ? pickInRound : teams + 1 - pickInRound;
}

function countPickedPositions(
  picks: DraftState["picks"],
  playersById: Map<string, Player>,
): Record<Position, number> {
  return countPlayerPositions(
    picks.map((pick) => playersById.get(pick.playerId)).filter((player): player is Player => Boolean(player)),
  );
}

function countPlayerPositions(players: Player[]): Record<Position, number> {
  const counts = emptyPositionCounts();
  for (const player of players) {
    counts[player.position] += 1;
  }
  return counts;
}

function emptyPositionCounts(): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
}

function getTeamsSelectingBeforeNextTurn(
  state: DraftState,
  nextUserPick: number | null,
  playersById: Map<string, Player>,
): DraftStrategyContext["board"]["teamsSelectingBeforeNextTurn"] {
  if (nextUserPick === null) {
    return [];
  }
  const teamsBySlot = new Map(state.teams.map((team) => [team.draftSlot, team]));
  const selected = new Map<string, DraftStrategyContext["board"]["teamsSelectingBeforeNextTurn"][number]>();
  for (let pickNo = state.currentPick; pickNo < nextUserPick; pickNo += 1) {
    const team = teamsBySlot.get(draftSlotForPick(pickNo, state.settings.teams));
    if (!team || team.id === state.userTeamId || selected.has(team.id)) {
      continue;
    }
    selected.set(team.id, {
      team: team.name,
      draftSlot: team.draftSlot,
      positionCounts: countRosterPositions(team, playersById),
    });
  }
  return [...selected.values()];
}

function countRosterPositions(
  userTeam: DraftState["teams"][number] | null,
  playersById: Map<string, Player>,
): Record<Position, number> {
  const counts: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
  };

  for (const playerId of userTeam?.roster ?? []) {
    const player = playersById.get(playerId);
    if (player) {
      counts[player.position] += 1;
    }
  }

  return counts;
}



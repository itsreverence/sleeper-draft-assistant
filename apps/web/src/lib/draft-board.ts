import type { DraftState, Pick, Player, Team } from "@sleeper-draft-assistant/shared";

export type DraftBoardCell = {
  round: number;
  draftSlot: number;
  pickNo: number;
  pick: Pick | null;
  player: Player | null;
  owner: Team | null;
  isCurrent: boolean;
  isUserPick: boolean;
  isUserSlot: boolean;
  isTraded: boolean;
};

export type DraftBoardRow = {
  round: number;
  direction: "forward" | "reverse";
  cells: DraftBoardCell[];
};

export type DraftBoardView = "live" | "full";

export function pickNumberForDraftSlot(round: number, draftSlot: number, teamCount: number): number {
  if (round <= 0 || draftSlot <= 0 || teamCount <= 0) {
    return 0;
  }

  return round % 2 === 1
    ? (round - 1) * teamCount + draftSlot
    : round * teamCount - draftSlot + 1;
}

export function currentDraftRound(state: DraftState): number {
  return Math.min(
    state.settings.rounds,
    Math.max(1, Math.ceil(state.currentPick / Math.max(1, state.settings.teams))),
  );
}

export function visibleDraftRounds(state: DraftState, view: DraftBoardView): number[] {
  if (view === "full") {
    return range(1, state.settings.rounds);
  }

  const currentRound = currentDraftRound(state);
  const end = state.status === "complete"
    ? state.settings.rounds
    : Math.min(state.settings.rounds, currentRound + 2);
  const start = state.status === "complete"
    ? Math.max(1, end - 3)
    : Math.max(1, Math.min(currentRound - 1, end - 3));

  return range(start, end);
}

export function buildDraftBoardRows(state: DraftState, rounds: number[]): DraftBoardRow[] {
  const teamsBySlot = new Map(state.teams.map((team) => [team.draftSlot, team]));
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const picksByNumber = new Map(state.picks.map((pick) => [pick.pickNo, pick]));
  const teamCount = state.settings.teams;

  return rounds.map((round) => ({
    round,
    direction: round % 2 === 1 ? "forward" : "reverse",
    cells: range(1, teamCount).map((draftSlot) => {
      const pickNo = pickNumberForDraftSlot(round, draftSlot, teamCount);
      const pick = picksByNumber.get(pickNo) ?? null;
      const slotTeam = teamsBySlot.get(draftSlot) ?? null;
      const owner = pick ? teamsById.get(pick.teamId) ?? null : slotTeam;

      return {
        round,
        draftSlot,
        pickNo,
        pick,
        player: pick ? playersById.get(pick.playerId) ?? null : null,
        owner,
        isCurrent: state.status !== "complete" && pickNo === state.currentPick,
        isUserPick: pick?.teamId === state.userTeamId,
        isUserSlot: slotTeam?.id === state.userTeamId,
        isTraded: Boolean(pick && slotTeam && pick.teamId !== slotTeam.id),
      };
    }),
  }));
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

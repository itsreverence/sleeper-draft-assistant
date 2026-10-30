import { remainingTeamPicks } from "@sleeper-draft-assistant/shared/draft-timing";
import type { DraftState, Pick, Player, Position, Team } from "@sleeper-draft-assistant/shared";
import { countUnfilledStarterSlots, STARTER_SLOT_POSITIONS } from "@sleeper-draft-assistant/shared/roster-slots";

import { formatDraftPick, getUserTeam, isUserOnTheClock, picksUntilUserTurn, upcomingUserPicks } from "./format";

export type DraftBoardCell = {
  round: number;
  draftSlot: number;
  pickNo: number;
  pick: Pick | null;
  player: Player | null;
  owner: Team | null;
  isCurrent: boolean;
  isUserNext: boolean;
  isUserPick: boolean;
  isUserOwned: boolean;
  isTraded: boolean;
};

export type DraftBoardRow = {
  round: number;
  direction: RoundDirection | null;
  cells: DraftBoardCell[];
};

export type RoundDirection = "forward" | "reverse";

export type DraftBoardView = "live" | "full";

export function pickNumberForDraftSlot(round: number, draftSlot: number, teamCount: number): number {
  if (round <= 0 || draftSlot <= 0 || teamCount <= 0) {
    return 0;
  }

  return round % 2 === 1
    ? (round - 1) * teamCount + draftSlot
    : round * teamCount - draftSlot + 1;
}

export function roundDirection(state: DraftState, round: number): RoundDirection | null {
  if (state.pickOrder?.source === "unsupported") {
    return null;
  }
  const entries = state.pickOrder?.entries.filter((entry) => entry.round === round) ?? [];
  if (entries.length > 1) {
    return entries[0]!.draftSlot < entries.at(-1)!.draftSlot ? "forward" : "reverse";
  }
  return round % 2 === 1 ? "forward" : "reverse";
}

export function nextPickForTeam(state: DraftState, teamId: string): number | null {
  return remainingTeamPicks(state, teamId)[0] ?? null;
}

export function currentPickAnnouncement(state: DraftState): string {
  if (state.status === "complete") {
    return "Draft complete";
  }
  if (state.status === "pre_draft") {
    return "";
  }
  const slot = formatDraftPick(state.currentPick, state.settings.teams);
  if (isUserOnTheClock(state)) {
    return `Pick ${slot}. You are on the clock.`;
  }
  const entry = state.pickOrder?.entries.find((candidate) => candidate.pickNo === state.currentPick);
  const owner = state.teams.find((team) => team.id === entry?.teamId);
  return owner ? `Pick ${slot}. ${owner.name} is on the clock.` : `Pick ${slot}.`;
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

  const end = state.status === "complete"
    ? state.settings.rounds
    : Math.min(state.settings.rounds, currentDraftRound(state) + 1);

  return range(Math.max(1, end - 1), end);
}

export type PickStripPick = { label: string; slot: string; overall: number };

export type PickStripSummary = {
  tone: "clock" | "neutral";
  label: string;
  facts: PickStripPick[];
};

export function pickStripSummary(state: DraftState): PickStripSummary {
  if (state.status === "complete") {
    return { tone: "neutral", label: "Draft complete", facts: [] };
  }

  const facts = (...picks: Array<[string, number | undefined]>): PickStripPick[] => picks.flatMap(([label, overall]) => overall === undefined
    ? []
    : [{ label, slot: formatDraftPick(overall, state.settings.teams), overall }]);
  const [nextUserPick, followingUserPick] = upcomingUserPicks(state);

  if (state.status === "pre_draft") {
    return { tone: "neutral", label: "Draft not started", facts: facts(["First pick", nextUserPick]) };
  }

  if (isUserOnTheClock(state)) {
    return { tone: "clock", label: "On the clock", facts: facts(["Pick", state.currentPick], ["next", followingUserPick]) };
  }

  const picksAway = picksUntilUserTurn(state);
  const label = picksAway === null
    ? (state.pickOrder?.source === "unsupported" || !getUserTeam(state) ? "Pick timing unknown" : "No picks left")
    : `${picksAway} pick${picksAway === 1 ? "" : "s"} away`;
  return { tone: "neutral", label, facts: facts(["Your pick", nextUserPick], ["Now", state.currentPick]) };
}

export type StarterSlotGroup = { label: string; filled: number; total: number };

export type StarterSlotSummary = { filled: number; total: number; groups: StarterSlotGroup[] };

const SKILL_SLOT_POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE"];

export function starterSlotSummary(state: DraftState): StarterSlotSummary {
  const rosterIds = new Set(getUserTeam(state)?.roster ?? []);
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const player of state.players) {
    if (rosterIds.has(player.id)) counts[player.position] += 1;
  }

  const slots = state.settings.rosterSlots;
  const slotCount = (position: Position) => Math.max(0, slots[position] ?? 0);
  const dedicatedGroup = (label: string, positions: readonly Position[]): StarterSlotGroup => ({
    label,
    filled: positions.reduce((sum, position) => sum + Math.min(slotCount(position), counts[position]), 0),
    total: positions.reduce((sum, position) => sum + slotCount(position), 0),
  });
  const skill = SKILL_SLOT_POSITIONS.map((position) => dedicatedGroup(position, [position]));
  const kickingDefense = dedicatedGroup("K/DEF", ["K", "DEF"]);
  const dedicated = [...skill, kickingDefense];

  const flexTotal = Object.entries(slots).reduce((sum, [slot, count]) =>
    (STARTER_SLOT_POSITIONS[slot]?.length ?? 0) > 1 ? sum + Math.max(0, count) : sum, 0);
  const total = dedicated.reduce((sum, group) => sum + group.total, flexTotal);
  const filled = total - countUnfilledStarterSlots(slots, counts);
  const flex: StarterSlotGroup = {
    label: "FLEX",
    filled: filled - dedicated.reduce((sum, group) => sum + group.filled, 0),
    total: flexTotal,
  };
  const groups = [...skill, flex, kickingDefense].filter((group) => group.total > 0);

  return { filled, total, groups };
}

export function buildDraftBoardRows(state: DraftState, rounds: number[]): DraftBoardRow[] {
  const teamsBySlot = new Map(state.teams.map((team) => [team.draftSlot, team]));
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const picksByNumber = new Map(state.picks.map((pick) => [pick.pickNo, pick]));
  const entriesBySlot = new Map((state.pickOrder?.entries ?? []).map((entry) => [`${entry.round}:${entry.draftSlot}`, entry]));
  const teamCount = state.settings.teams;
  const nextUserPick = state.status === "drafting" ? upcomingUserPicks(state, 1)[0] : undefined;

  return rounds.map((round) => ({
    round,
    direction: roundDirection(state, round),
    cells: range(1, teamCount).map((draftSlot) => {
      const entry = entriesBySlot.get(`${round}:${draftSlot}`);
      const pickNo = entry?.pickNo ?? pickNumberForDraftSlot(round, draftSlot, teamCount);
      const pick = picksByNumber.get(pickNo) ?? null;
      const slotTeam = teamsBySlot.get(draftSlot) ?? null;
      const ownerId = pick?.teamId ?? entry?.teamId ?? slotTeam?.id ?? null;

      return {
        round,
        draftSlot,
        pickNo,
        pick,
        player: pick ? playersById.get(pick.playerId) ?? null : null,
        owner: ownerId ? teamsById.get(ownerId) ?? null : null,
        isCurrent: state.status === "drafting" && pickNo === state.currentPick,
        isUserNext: pickNo === nextUserPick,
        isUserPick: pick?.teamId === state.userTeamId,
        isUserOwned: ownerId === state.userTeamId,
        isTraded: Boolean(ownerId && slotTeam && ownerId !== slotTeam.id),
      };
    }),
  }));
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

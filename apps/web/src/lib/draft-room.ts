import { isDraftChoiceRosterFeasible } from "@sleeper-draft-assistant/engine";
import { AI_REASON_LINE_MAX_LENGTH, draftStateRevision } from "@sleeper-draft-assistant/shared";
import { recentDraftPicks } from "@sleeper-draft-assistant/shared/draft-timing";

import type { AiRequestPhase } from "./api";
import { isNearUserTurn, playerCardFacts, recommendationTurnPresentation } from "./ai-panel";
import { formatDraftPick, picksUntilUserTurn, teamName } from "./format";
import type { AiDraftDecision, AiDraftStrategyPayload, DraftOption, DraftState, PlayerPreferences, Position } from "./types";

export type DraftRoomMode = "complete" | "emergency" | "on-clock" | "approaching" | "waiting";
export type ShortlistMode = Extract<DraftRoomMode, "on-clock" | "approaching">;

// Automatic analysis already runs before the draft starts, so pre_draft leads with its shortlist; it is never on the clock.
export function draftRoomMode(state: DraftState, emergency: boolean): DraftRoomMode {
  if (state.status === "complete") return "complete";
  if (emergency) return "emergency";
  if (state.status === "pre_draft") return "approaching";
  const picksAway = picksUntilUserTurn(state);
  if (picksAway === 0) return "on-clock";
  return picksAway !== null && isNearUserTurn(picksAway) ? "approaching" : "waiting";
}

export function isShortlistMode(mode: DraftRoomMode): mode is ShortlistMode {
  return mode === "on-clock" || mode === "approaching";
}

export type StrategyCall = {
  draftId: string;
  revision: string;
  payload: AiDraftStrategyPayload;
  // Players an earlier call ranked who are gone now. They keep their struck row, so a refresh never moves the top row.
  carried: DraftOption[];
};

export type TakenRow = { option: DraftOption; takenBy: string };

export type ShortlistView = {
  // Always the Assistant's own order with unavailable players removed; nothing here re-ranks.
  ranked: DraftOption[];
  taken: TakenRow[];
  promoted: boolean;
  stale: boolean;
  fromPick: string;
};

const MAX_TAKEN_ROWS = 2;

function callOptions(payload: AiDraftStrategyPayload): DraftOption[] {
  const options = new Map([payload.recommendedCandidate, ...payload.alternativeCandidates].map((option) => [option.player.id, option]));
  return [...options.values()];
}

export function carriedTakenOptions(previous: StrategyCall | null, state: DraftState | null): DraftOption[] {
  if (!previous || !state) return [];
  const drafted = new Set(state.picks.map((pick) => pick.playerId));
  return [...previous.carried, ...callOptions(previous.payload)].filter((option) => drafted.has(option.player.id));
}

export function shortlistView(state: DraftState, call: StrategyCall, preferences: PlayerPreferences): ShortlistView {
  const picksByPlayer = new Map(state.picks.map((pick) => [pick.playerId, pick]));
  const lastUserPick = Math.max(0, ...state.picks
    .filter((pick) => pick.teamId === state.userTeamId && pick.pickNo < state.currentPick)
    .map((pick) => pick.pickNo));
  const options = callOptions(call.payload);
  const ranked = options.filter(({ player }) => !picksByPlayer.has(player.id)
    && preferences[player.id] !== "exclude"
    && isDraftChoiceRosterFeasible(state, player.id));
  const taken = [...new Map([...call.carried, ...options].map((option) => [option.player.id, option])).values()]
    .flatMap((option) => {
      const pick = picksByPlayer.get(option.player.id);
      return pick && pick.teamId !== state.userTeamId && pick.pickNo > lastUserPick ? [{ option, pick }] : [];
    })
    .sort((a, b) => b.pick.pickNo - a.pick.pickNo)
    .slice(0, MAX_TAKEN_ROWS)
    .map(({ option, pick }) => ({ option, takenBy: teamName(state, pick.teamId) }));
  return {
    ranked,
    taken,
    promoted: ranked[0]?.player.id !== call.payload.recommendedCandidate.player.id,
    stale: call.revision !== draftStateRevision(state),
    fromPick: formatDraftPick(call.payload.pickNumber, state.settings.teams),
  };
}

const SENTENCE = /^.*?[\p{L}\d)]{3}[.!?](?=\s+\p{Lu}|\s*$)/su;

// The word before a sentence's full stop needs three characters, so A.J. Brown and St. Brown do not end one.
function summaryLine(summary: string): string {
  const text = summary.trim();
  const sentence = text.match(SENTENCE)?.[0] ?? text;
  if (sentence.length <= AI_REASON_LINE_MAX_LENGTH) return sentence;
  const clipped = sentence.slice(0, AI_REASON_LINE_MAX_LENGTH);
  const wordEnd = /\s/.test(sentence[AI_REASON_LINE_MAX_LENGTH]!) ? clipped.length : clipped.search(/\s\S*$/);
  return `${(wordEnd > 0 ? clipped.slice(0, wordEnd) : clipped).replace(/[\s,;:.]+$/, "")}…`;
}

export function decisionReasonLine(decision: AiDraftDecision): string {
  return decision.reasonLine ?? summaryLine(decision.summary);
}

export function shortlistReason(view: ShortlistView, decision: AiDraftDecision, updating: boolean): string {
  if (!view.promoted) return decisionReasonLine(decision);
  return updating ? "The Assistant's next choice. New call on the way." : "The Assistant's next choice.";
}

export type ShortlistFacts = { adp: string | null; proj: string | null };

export function shortlistFacts(option: DraftOption): ShortlistFacts {
  const facts = new Map(playerCardFacts(option).map(({ label, value }) => [label, value]));
  const number = (label: string, digits: number) => {
    const value = facts.get(label);
    return value === undefined ? null : Number(value).toFixed(digits);
  };
  return { adp: number("ADP", 1), proj: number("Proj", 0) };
}

// Timing only: this labels an alternative by its imported market point and never reorders the list.
export function contingencyLabel(state: DraftState, option: DraftOption): string | null {
  const { contingent, nextUserPick } = recommendationTurnPresentation(state, option.player.name, "");
  if (!contingent || nextUserPick === null) return null;
  const marketPoint = option.player.importedRank ?? option.player.realTimeAdp ?? option.player.adp;
  return marketPoint != null && marketPoint >= Math.max(state.currentPick, nextUserPick - 2)
    ? `${formatDraftPick(nextUserPick, state.settings.teams)} range`
    : "Elite faller";
}

export function recentPickPositions(state: DraftState, limit = 3): Position[] {
  const positionById = new Map(state.players.map((player) => [player.id, player.position]));
  return recentDraftPicks(state, limit).flatMap((pick) => {
    const position = positionById.get(pick.playerId);
    return position ? [position] : [];
  });
}

const UPDATE_LABELS: Record<AiRequestPhase, string> = {
  queued: "Call queued…",
  thinking: "Updating call…",
  news: "Checking news…",
};

export function callUpdateLabel(phase: AiRequestPhase): string {
  return UPDATE_LABELS[phase];
}

export function callAnnouncement(view: ShortlistView | null, error: string): string {
  const failed = error ? "The Assistant call could not update." : "";
  if (!view) return failed;
  const [top] = view.ranked;
  if (!top) return `No player on this shortlist is available for your roster. Use Find player. ${failed}`.trim();
  if (!view.promoted) return `The Assistant recommends ${top.player.name}. ${failed}`.trim();
  const [latest] = view.taken;
  const gone = latest ? `${latest.option.player.name} was taken by ${latest.takenBy}. ` : "";
  return `${gone}${top.player.name} is the Assistant's next choice. ${failed}`.trim();
}

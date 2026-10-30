import { isWeeklyProjectionSummaryFresh } from "@sleeper-draft-assistant/engine";

import { effectiveTeamWeek, formatRosterSlot, rosterStatus } from "./format";
import type { Player, Position, TeamManagerState, TeamWeekContext, WeeklyProjectionImportSummary } from "./types";

type TeamRosterSlot = TeamManagerState["roster"]["starters"][number];

export type TeamDataSection = "readiness" | "weekly-files" | "weekly-week";

export type StarterAttention = {
  kind: "starter";
  id: string;
  rowId: string;
  label: string;
  tone: "warning" | "danger";
  question: string;
};

export type DataAttention = {
  kind: "data";
  id: string;
  label: string;
  section: TeamDataSection;
};

export type AttentionItem = StarterAttention | DataAttention;

export type LineupCheck =
  | { state: "needs-look"; items: AttentionItem[] }
  | { state: "clear"; detail: string }
  | { state: "note"; text: string };

export type LineupCheckInput = {
  state: TeamManagerState;
  weekContext?: TeamWeekContext | null;
  selectedWeek?: number | null;
  weeklySummary?: WeeklyProjectionImportSummary | null;
  refreshFailed?: boolean;
  now?: number;
};

type CheckContext = {
  state: TeamManagerState;
  week: number | null;
  weeklySummary: WeeklyProjectionImportSummary | null;
  now: number;
};

type StarterFinding = Pick<StarterAttention, "label" | "tone" | "question">;
type StarterRule = { id: string; find: (slot: TeamRosterSlot, context: CheckContext) => StarterFinding | null };
type LineupRule = (context: CheckContext) => Array<Omit<DataAttention, "kind">>;

// These phases have no current weekly lineup: Sleeper's schedule facts and matchups do not apply, so nothing can be cleared or flagged.
const PHASES_WITHOUT_A_LINEUP: Partial<Record<TeamManagerState["seasonPhase"], string>> = {
  preseason: "Preseason. Weekly lineup checks start with Week 1.",
  postseason: "Postseason. There is no weekly lineup to check.",
};

const scheduleAvailable = ({ state }: CheckContext) => state.scheduleStatus?.available !== false;

// The first rule that matches wins, so one starter raises one item. A bye comes before a status because it already means no game.
const STARTER_RULES: StarterRule[] = [
  {
    id: "empty",
    find: ({ slot, player }) => player ? null : {
      label: `${formatRosterSlot(slot)} slot is empty`,
      tone: "warning",
      question: `How should I fill my open ${formatRosterSlot(slot)} slot?`,
    },
  },
  {
    id: "bye",
    find: ({ slot, player }, { week }) => player?.schedule?.onBye === true && week !== null ? {
      label: `${player.name} is on bye`,
      tone: "warning",
      question: `${player.name} is on bye in Week ${week}. Who should I start at ${formatRosterSlot(slot)}?`,
    } : null,
  },
  {
    // Sleeper's status is global player metadata, not a game designation for the viewed week, so copy says "listed" and quotes it verbatim.
    id: "status",
    find: ({ slot, player }) => {
      const status = player && rosterStatus(player);
      return player && status?.injury ? {
        label: `${player.name} is listed ${status.label}`,
        tone: status.tone,
        question: `Sleeper lists ${player.name} as ${status.label}. Should I change anything at ${formatRosterSlot(slot)}?`,
      } : null;
    },
  },
  {
    id: "bye-unknown",
    find: ({ slot, player }, context) => player && context.week !== null && scheduleAvailable(context) && (player.schedule?.onBye ?? null) === null ? {
      label: `${player.name}'s bye status is unknown`,
      tone: "warning",
      question: `${player.name}'s bye status is unknown. Does that affect my ${formatRosterSlot(slot)} slot?`,
    } : null,
  },
];

const positionLabel = (position: Position) => (position === "DEF" ? "DST" : position);

function unprojectedStarters({ state }: CheckContext): Player[] {
  return state.roster.starters.flatMap(({ player }) =>
    player && player.schedule?.onBye !== true && (player.weeklyProjectedPoints ?? null) === null ? [player] : []);
}

function positionGap(position: Position, count: number, summary: WeeklyProjectionImportSummary): string {
  const label = positionLabel(position);
  if (!summary.positions.includes(position)) return `${label} projections missing`;
  const result = summary.positionResults.find((item) => item.position === position);
  if (result?.matched === 0) return result.rowsParsed === 0 ? `${label} projection file has no rows` : `${label} projections matched no players`;
  return `${count} ${label} starter${count === 1 ? " has" : "s have"} no projection match`;
}

const LINEUP_RULES: LineupRule[] = [
  ({ week }) => week === null
    ? [{ id: "week-unknown", label: "Current week unknown. Choose one", section: "weekly-week" }]
    : [],
  (context) => context.week !== null && !scheduleAvailable(context)
    ? [{ id: "schedule-unavailable", label: "NFL schedule unavailable, so some byes are unknown", section: "readiness" }]
    : [],
  (context) => {
    const { week, weeklySummary, now } = context;
    const missing = unprojectedStarters(context);
    if (week === null || missing.length === 0) return [];
    if (!weeklySummary) return [{ id: "projections-none", label: `No Week ${week} projections imported`, section: "weekly-files" }];
    if (!isWeeklyProjectionSummaryFresh(weeklySummary, now)) {
      return [{ id: "projections-stale", label: "Weekly projections are 3 or more days old", section: "weekly-files" }];
    }
    const counts = new Map<Position, number>();
    for (const { position } of missing) counts.set(position, (counts.get(position) ?? 0) + 1);
    return [...counts].map(([position, count]) => ({
      id: `projections-${position}`,
      label: positionGap(position, count, weeklySummary),
      section: "weekly-files",
    }));
  },
];

function checkedWeek({ state, weekContext = null, selectedWeek = null }: LineupCheckInput): number | null {
  if (state.seasonPhase === "regular") return effectiveTeamWeek(state, weekContext, selectedWeek);
  return selectedWeek;
}

function quietResult(input: LineupCheckInput, week: number): LineupCheck {
  const { state, selectedWeek = null, refreshFailed = false } = input;
  const starters = state.roster.starters.length;
  if (starters === 0) return { state: "note", text: "Sleeper reports no starting slots for this team." };
  if (refreshFailed) return { state: "note", text: "Nothing flagged, but the last refresh failed. This is earlier Sleeper data." };
  if (selectedWeek !== null && selectedWeek !== state.week) {
    return { state: "note", text: `Nothing flagged for Week ${selectedWeek}. Sleeper's active week is ${state.week ?? "unknown"}.` };
  }
  return { state: "clear", detail: `${starters} starter${starters === 1 ? "" : "s"}, no byes or status flags, all projected for Week ${week}` };
}

export function lineupCheck(input: LineupCheckInput): LineupCheck {
  const { state, weeklySummary = null, now = Date.now() } = input;
  const phaseNote = PHASES_WITHOUT_A_LINEUP[state.seasonPhase];
  if (phaseNote) return { state: "note", text: phaseNote };

  const week = checkedWeek(input);
  const context: CheckContext = { state, week, weeklySummary, now };
  const starterItems = state.roster.starters.flatMap((slot, index): AttentionItem[] => {
    for (const rule of STARTER_RULES) {
      const finding = rule.find(slot, context);
      if (finding) {
        const rowId = starterRowId(index);
        return [{ kind: "starter", id: `${rule.id}-${rowId}`, rowId, ...finding }];
      }
    }
    return [];
  });
  const dataItems = LINEUP_RULES.flatMap((rule) => rule(context)).map((item): AttentionItem => ({ kind: "data", ...item }));
  const items = [...starterItems, ...dataItems];
  if (items.length > 0 || week === null) return { state: "needs-look", items };
  return quietResult(input, week);
}

export function starterRowId(index: number): string {
  return `starter-${index}`;
}

export function attentionHeading(count: number): string {
  return `${count} thing${count === 1 ? " needs" : "s need"} a look`;
}

export function starterAttention(check: LineupCheck | null): Map<string, StarterAttention> {
  if (check?.state !== "needs-look") return new Map();
  return new Map(check.items.flatMap((item) => (item.kind === "starter" ? [[item.rowId, item]] : [])));
}

export function lineupAnnouncement(check: LineupCheck | null): string {
  switch (check?.state) {
    case "needs-look":
      return `${attentionHeading(check.items.length)}: ${check.items.map((item) => item.label).join(". ")}.`;
    case "clear":
      return "Lineup looks set.";
    case "note":
      return check.text;
    default:
      return "";
  }
}

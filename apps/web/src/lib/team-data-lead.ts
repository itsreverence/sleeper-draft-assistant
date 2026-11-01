import { isWeeklyProjectionSummaryFresh } from "@sleeper-draft-assistant/engine";

import { getImportFreshness, getOldestImportAppliedAt } from "./freshness";
import { checkedWeek, positionLabel } from "./team-attention";
import type { Position, TeamDataReadiness, TeamManagerState, TeamWeekContext, WeeklyProjectionImportSummary } from "./types";

export type LeadAction =
  | { kind: "choose-files"; label: string; fallbackPosition: Position | null; season: string; week: number }
  | { kind: "choose-week"; label: string };

export type LeadSource = { position: Position; label: string; week: number };

export type LeadView = { text: string; back: { season: string; week: number } | null };

export type TeamDataLead = {
  tone: "clear" | "warn" | "note";
  title: string;
  detail: string;
  action: LeadAction | null;
  positions: Array<{ position: Position; loaded: boolean }>;
  sources: LeadSource[];
  view: LeadView | null;
  notice: string | null;
};

export type TeamDataLeadInput = {
  state: TeamManagerState | null;
  readiness: TeamDataReadiness | null;
  weeklySummary: WeeklyProjectionImportSummary | null;
  weekContext?: TeamWeekContext | null;
  selectedWeek?: number | null;
  selectedSeason?: string | null;
  isLoading?: boolean;
  weeklyError?: string;
  // Outlives the error text, which clears as soon as the user picks files or retries. Only an accepted import or clear ends it.
  failedWeeklyImport?: { season: string; week: number } | null;
  rosError?: string;
  refreshFailed?: boolean;
  now?: number;
};

type WeekFacts = {
  state: TeamManagerState;
  readiness: TeamDataReadiness;
  summary: WeeklyProjectionImportSummary | null;
  week: number;
  season: string;
  viewedSeason: string;
  now: number;
};

type WeekFinding = Pick<TeamDataLead, "title" | "detail"> & { choose?: { positions: Position[]; label?: string } };
type WeekRule = (facts: WeekFacts) => WeekFinding | null;

const FAILED_REFRESH = "The last refresh failed. This is earlier Sleeper data.";

const PHASE_NOTES: Partial<Record<TeamManagerState["seasonPhase"], Pick<TeamDataLead, "title" | "detail">>> = {
  preseason: {
    title: "Regular-season weekly advice is not active yet",
    detail: "Your roster is available for structure and depth review. Matchups and weekly readiness begin with Week 1.",
  },
  postseason: {
    title: "The regular season is over",
    detail: "There is no weekly lineup to check. Files you import for a week stay available below.",
  },
};

const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
const positionList = (positions: Position[]) => listFormat.format(positions.map(positionLabel));

function emptyFileFacts({ readiness, summary }: WeekFacts): string[] {
  return (summary?.positionResults ?? [])
    .filter((result) => readiness.missingPositions.includes(result.position) && result.matched === 0)
    .map((result) => `${positionLabel(result.position)} file ${result.rowsParsed === 0 ? "has no rows" : "imported, but no players matched"}.`);
}

// First match wins. Any finding means the week can't read as loaded, so a stale or mismatched payload never reaches the loaded state.
const WEEK_RULES: WeekRule[] = [
  ({ summary, week, season, viewedSeason, readiness }) => {
    const other = summary && season && summary.season !== season ? summary.season : viewedSeason !== season ? viewedSeason : null;
    if (!other) return null;
    const unused = summary
      ? `Imported data is for ${summary.season} Week ${summary.week}, but this team view is connected to a ${season} Sleeper league. It is saved for reference but is not used by lineup, waiver, or Assistant advice.`
      : `This team view is connected to a ${season} Sleeper league. Data from other seasons is not used by lineup, waiver, or Assistant advice.`;
    return {
      title: summary ? `Saved projections are for ${other}` : `Viewing the ${other} season`,
      detail: `${unused} New files go to ${season} Week ${week}.`,
      choose: { positions: readiness.relevantPositions },
    };
  },
  ({ summary, week, readiness }) => summary && summary.week !== week ? {
    title: `Saved projections are for Week ${summary.week}`,
    detail: `This view is Week ${week}, so those files don't describe it. New files go to Week ${week}.`,
    choose: { positions: readiness.relevantPositions },
  } : null,
  ({ summary, week, now, readiness }) => {
    if (!summary || isWeeklyProjectionSummaryFresh(summary, now)) return null;
    const { label } = getImportFreshness(getOldestImportAppliedAt(summary.positionResults.map((result) => result.appliedAt), summary.appliedAt), 3, now);
    return {
      title: label === "date unknown" ? `Week ${week} projections have no saved date` : `Week ${week} projections are ${label}`,
      detail: "Import fresh files before using weekly advice. Files this old are kept here but aren't used.",
      choose: { positions: readiness.relevantPositions },
    };
  },
  ({ summary, week, readiness }) => summary ? null : {
    title: `Week ${week} has no projections`,
    detail: `Download the ${positionList(readiness.relevantPositions)} files, then select them together. The FLEX export is redundant.`,
    choose: { positions: readiness.relevantPositions },
  },
  (facts) => {
    const { missingPositions: missing, relevantPositions } = facts.readiness;
    if (missing.length === 0) return null;
    const all = missing.length === relevantPositions.length;
    const add = `Add the ${missing.length === 1 ? "missing file" : "missing files"} to finish this week. The other files stay as they are.`;
    return {
      title: all ? `Week ${facts.week} has no usable projections` : `Week ${facts.week} is missing ${positionList(missing)} projections`,
      detail: [...emptyFileFacts(facts), add].join(" "),
      choose: { positions: missing, label: all ? undefined : `Choose ${positionList(missing)} ${missing.length === 1 ? "file" : "files"}` },
    };
  },
  ({ readiness, week }) => {
    if (readiness.status === "ready") return null;
    const matchRate = readiness.importMatchRate === null ? null : Math.round(readiness.importMatchRate * 100);
    const lowMatch = matchRate !== null && matchRate < 85 ? ` Only ${matchRate}% of imported rows matched Sleeper players.` : "";
    return {
      title: `Week ${week} projections have coverage gaps`,
      detail: `${readiness.projectedRosterPlayers}/${readiness.eligibleRosterPlayers} active roster players are projected.${lowMatch} Check that the files match this week and league.`,
      choose: { positions: readiness.relevantPositions },
    };
  },
];

function viewOf({ state, week, season, viewedSeason }: WeekFacts): LeadView | null {
  const active = state.week;
  if (viewedSeason === season && week === active) return null;
  const back = active ? { season, week: active } : null;
  if (viewedSeason !== season) {
    return { text: `Viewing ${viewedSeason} Week ${week}; this league is ${season}.`, back };
  }
  return {
    text: `Viewing Week ${week}; ${active ? `Sleeper currently reports Week ${active}` : "Sleeper's active week is unknown"}. Advice will use the selected week's saved projections.`,
    back,
  };
}

const quiet = (fields: Pick<TeamDataLead, "title" | "detail"> & Partial<TeamDataLead>): TeamDataLead => ({
  tone: "note", action: null, positions: [], sources: [], view: null, notice: null, ...fields,
});

function chooseAction(facts: WeekFacts, { positions, label }: NonNullable<WeekFinding["choose"]>): LeadAction {
  return {
    kind: "choose-files",
    label: label ?? "Choose CSV files",
    fallbackPosition: positions.length === 1 ? positions[0]! : null,
    season: facts.season,
    week: facts.week,
  };
}

function sourcesFor({ readiness, week }: WeekFacts, positions: Position[]): LeadSource[] {
  if (positions.length === 0) return [];
  return positions.length < readiness.relevantPositions.length
    ? positions.map((position) => ({ position, label: `FantasyPros ${positionLabel(position)}`, week }))
    : [{ position: positions[0]!, label: "Open FantasyPros", week }];
}

function positionsFor({ readiness, summary, week, season }: WeekFacts) {
  if (!summary || summary.week !== week || (season && summary.season !== season)) return [];
  return readiness.relevantPositions.map((position) => ({ position, loaded: readiness.loadedPositions.includes(position) }));
}

function loadedLead(input: TeamDataLeadInput, facts: WeekFacts, shared: Pick<TeamDataLead, "positions" | "view">): TeamDataLead {
  const { week, readiness, state } = facts;
  const replace = chooseAction(facts, { positions: readiness.relevantPositions });
  if (input.weeklyError || (input.failedWeeklyImport?.week === week && input.failedWeeklyImport.season === facts.season)) {
    return {
      ...quiet({ title: "Weekly projections didn't update", detail: `Week ${week} still uses the files saved earlier.` }),
      ...shared,
      tone: "warn",
      action: replace,
      sources: sourcesFor(facts, readiness.relevantPositions),
    };
  }
  if (input.refreshFailed) {
    return { ...quiet({ title: `Can't confirm Week ${week}`, detail: FAILED_REFRESH }), ...shared, tone: "warn" };
  }
  const caveats = [
    state.scheduleStatus?.available === false ? "NFL schedule unavailable, so some byes are unknown." : "",
    input.rosError ? "Season value rankings didn't update. See below." : "",
  ].filter(Boolean);
  return {
    ...quiet({ title: `Week ${week} projections are loaded`, detail: [readiness.headline, ...caveats].join(" ") }),
    ...shared,
    tone: caveats.length > 0 || shared.view ? "note" : "clear",
  };
}

export function teamDataLead(input: TeamDataLeadInput): TeamDataLead {
  const { state, readiness, weeklySummary: summary, weekContext = null, selectedWeek = null, selectedSeason = null, isLoading = false, refreshFailed = false, now = Date.now() } = input;
  if (!state) return quiet({ title: "No team is loaded", detail: "Open a Sleeper team to check weekly data." });
  if (isLoading) return quiet({ title: "Checking weekly data", detail: "This updates as soon as Sleeper responds." });

  const notice = refreshFailed ? FAILED_REFRESH : null;
  const phaseNote = PHASE_NOTES[state.seasonPhase];
  if (phaseNote) return quiet({ ...phaseNote, notice });

  const week = checkedWeek({ state, weekContext, selectedWeek });
  if (week === null) {
    return quiet({
      tone: "warn",
      title: "Current week unknown",
      detail: "Sleeper isn't reporting a week. Choose one to see or import its projections.",
      action: { kind: "choose-week", label: "Choose week" },
      notice,
    });
  }
  if (!readiness) return quiet({ title: "Weekly data isn't checked yet", detail: "Refresh the team to check this week.", notice });

  const season = state.league.season ?? "";
  const facts: WeekFacts = { state, readiness, summary, week, season, viewedSeason: selectedSeason || season, now };
  const shared = { positions: positionsFor(facts), view: viewOf(facts) };
  for (const rule of WEEK_RULES) {
    const finding = rule(facts);
    if (finding) {
      const { choose, ...text } = finding;
      return {
        ...quiet(text),
        ...shared,
        tone: "warn",
        notice,
        action: choose ? chooseAction(facts, choose) : null,
        sources: choose ? sourcesFor(facts, choose.positions) : [],
      };
    }
  }
  return loadedLead(input, facts, shared);
}

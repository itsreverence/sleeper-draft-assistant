<script lang="ts">
  import type { TeamDataSection } from "../team-attention";
  import type {
    DraftScoringFormat,
    Position,
    SeasonValueRankingImportSummary,
    TeamDataReadiness,
    TeamManagerState,
    WeeklyProjectionImportSummary,
  } from "../types";
  import Drawer from "./Drawer.svelte";
  import RosRankingsImportPanel from "./RosRankingsImportPanel.svelte";
  import TeamDataReadinessPanel from "./TeamDataReadinessPanel.svelte";
  import WeeklyProjectionsImportPanel from "./WeeklyProjectionsImportPanel.svelte";

  const SECTION_FOCUS: Record<TeamDataSection, string | undefined> = {
    readiness: undefined,
    "weekly-files": ".weekly-import-panel input[type='file']",
    "weekly-week": ".weekly-import-panel input[type='number']",
  };

  let {
    section = "readiness",
    teamState,
    readiness,
    rosSummary,
    weeklySummary,
    defaultSeason,
    defaultWeek,
    scoring,
    rosError,
    weeklyError = $bindable(""),
    isLoading = false,
    isImportingRos,
    isClearingRos,
    isImportingWeekly,
    isClearingWeekly,
    onImportRos,
    onClearRos,
    onOpenRos,
    onOpenDraftRankings,
    onImportWeekly,
    onLoadWeek,
    onClearWeekly,
    onOpenWeekly,
    onClose,
  }: {
    section?: TeamDataSection;
    teamState: TeamManagerState | null;
    readiness: TeamDataReadiness | null;
    rosSummary: SeasonValueRankingImportSummary | null;
    weeklySummary: WeeklyProjectionImportSummary | null;
    defaultSeason: string;
    defaultWeek: number;
    scoring: DraftScoringFormat;
    rosError: string;
    weeklyError: string;
    isLoading?: boolean;
    isImportingRos: boolean;
    isClearingRos: boolean;
    isImportingWeekly: boolean;
    isClearingWeekly: boolean;
    onImportRos: (input: { season: string; scoring: DraftScoringFormat; csvText: string }) => void;
    onClearRos: (input: { season: string; scoring: DraftScoringFormat }) => void;
    onOpenRos: () => void;
    onOpenDraftRankings: () => void;
    onImportWeekly: (input: { files: Array<{ position: Position; csvText: string }>; season: string; week: number }) => void;
    onLoadWeek: (input: { season: string; week: number }) => void;
    onClearWeekly: (input: { season: string; week: number }) => void;
    onOpenWeekly: (position: Position, week: number) => void;
    onClose: () => void;
  } = $props();

</script>

<Drawer
  label="Manage team data"
  closeLabel="Close team data"
  eyebrow="Team Manager"
  title="Manage data"
  icon="database"
  subtitle="Update the evidence the Assistant uses for weekly and season-value decisions."
  initialFocus={SECTION_FOCUS[section]}
  {onClose}
>
  <TeamDataReadinessPanel readiness={readiness} {weeklySummary} seasonPhase={teamState?.seasonPhase} {isLoading} />
  <RosRankingsImportPanel
    hasTeam={Boolean(teamState)}
    defaultSeason={defaultSeason}
    leagueSeason={teamState?.league.season ?? ""}
    seasonPhase={teamState?.seasonPhase}
    currentWeek={teamState?.week ?? 0}
    {scoring}
    summary={rosSummary}
    weeklyLoaded={Boolean(weeklySummary)}
    error={rosError}
    isImporting={isImportingRos}
    isClearing={isClearingRos}
    onImport={onImportRos}
    onClear={onClearRos}
    onOpenFantasyPros={onOpenRos}
    onOpenDraftFallback={onOpenDraftRankings}
  />
  <WeeklyProjectionsImportPanel
    hasTeam={Boolean(teamState)}
    {defaultSeason}
    {defaultWeek}
    leagueSeason={teamState?.league.season ?? ""}
    currentWeek={teamState?.week ?? 0}
    summary={weeklySummary}
    rosLoaded={Boolean(rosSummary)}
    bind:error={weeklyError}
    isImporting={isImportingWeekly}
    isClearing={isClearingWeekly}
    onImport={onImportWeekly}
    onLoadContext={onLoadWeek}
    onClear={onClearWeekly}
    onOpenFantasyPros={onOpenWeekly}
  />
</Drawer>

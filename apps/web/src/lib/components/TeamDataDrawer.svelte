<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { TeamDataSection } from "../team-attention";
  import { teamDataLead } from "../team-data-lead";
  import type {
    DraftScoringFormat,
    Position,
    SeasonValueRankingImportSummary,
    TeamDataReadiness,
    TeamManagerState,
    TeamWeekContext,
    WeeklyProjectionImportSummary,
  } from "../types";
  import Drawer from "./Drawer.svelte";
  import RosRankingsImportPanel from "./RosRankingsImportPanel.svelte";
  import TeamCoverageLine from "./TeamCoverageLine.svelte";
  import TeamDataLeadBlock from "./TeamDataLeadBlock.svelte";
  import WeeklyProjectionsImportPanel from "./WeeklyProjectionsImportPanel.svelte";

  let {
    section = null,
    teamState,
    readiness,
    weekContext = null,
    selectedWeek = null,
    selectedSeason = null,
    refreshFailed = false,
    rosSummary,
    weeklySummary,
    defaultSeason,
    defaultWeek,
    scoring,
    rosError,
    weeklyError = $bindable(""),
    failedWeeklyImports = [],
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
    section?: TeamDataSection | null;
    teamState: TeamManagerState | null;
    readiness: TeamDataReadiness | null;
    weekContext?: TeamWeekContext | null;
    selectedWeek?: number | null;
    selectedSeason?: string | null;
    refreshFailed?: boolean;
    rosSummary: SeasonValueRankingImportSummary | null;
    weeklySummary: WeeklyProjectionImportSummary | null;
    defaultSeason: string;
    defaultWeek: number;
    scoring: DraftScoringFormat;
    rosError: string;
    weeklyError: string;
    failedWeeklyImports?: Array<{ season: string; week: number }>;
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

  const lead = $derived(teamDataLead({
    state: teamState,
    readiness,
    weeklySummary,
    weekContext,
    selectedWeek,
    selectedSeason,
    isLoading,
    failedWeeklyImports,
    rosError,
    refreshFailed,
  }));

  const WEEK_FIELD = "[data-line='weekly'] input[type='number']";
  const LINE_FILES = "[data-line='weekly'] input[type='file']";

  // Where each attention item lands: the one-step file control when the lead has it, otherwise the control inside its line.
  const leadHasFiles = untrack(() => lead.action?.kind === "choose-files");
  const SECTION_FOCUS: Record<TeamDataSection, string> = {
    readiness: "[data-line='coverage'] button",
    "weekly-files": leadHasFiles ? ".lead input[type='file']" : LINE_FILES,
    "weekly-week": WEEK_FIELD,
  };

  let weeklyOpen = $state(untrack(() => section === "weekly-week" || (section === "weekly-files" && !leadHasFiles)));
  let seasonValueOpen = $state(untrack(() => Boolean(rosError)));
  let coverageOpen = $state(untrack(() => section === "readiness"));

  let leadBlock: TeamDataLeadBlock | undefined = $state();

  async function changeWeek() {
    weeklyOpen = true;
    await tick();
    document.querySelector<HTMLElement>(WEEK_FIELD)?.focus();
  }

  // An import, clear, or week load can remove the control that had focus. Keep it in the drawer, on the sentence that just changed.
  $effect(() => {
    void lead;
    void rosSummary;
    void tick().then(() => {
      if (document.activeElement === document.body) leadBlock?.focusTitle();
    });
  });
</script>

{#snippet seasonValueLine()}
  <RosRankingsImportPanel
    hasTeam={Boolean(teamState)}
    {defaultSeason}
    leagueSeason={teamState?.league.season ?? ""}
    seasonPhase={teamState?.seasonPhase}
    currentWeek={teamState?.week ?? 0}
    {scoring}
    summary={rosSummary}
    error={rosError}
    isImporting={isImportingRos}
    isClearing={isClearingRos}
    bind:open={seasonValueOpen}
    onImport={onImportRos}
    onClear={onClearRos}
    onOpenFantasyPros={onOpenRos}
    onOpenDraftFallback={onOpenDraftRankings}
  />
{/snippet}

{#snippet weeklyLine()}
  <WeeklyProjectionsImportPanel
    hasTeam={Boolean(teamState)}
    {defaultSeason}
    {defaultWeek}
    shownWeek={selectedWeek ?? teamState?.week ?? null}
    leagueSeason={teamState?.league.season ?? ""}
    loadedFiles={readiness?.loadedPositions.length ?? 0}
    neededFiles={readiness?.relevantPositions.length ?? 6}
    summary={weeklySummary}
    bind:error={weeklyError}
    isImporting={isImportingWeekly}
    isClearing={isClearingWeekly}
    bind:open={weeklyOpen}
    onImport={onImportWeekly}
    onLoadContext={onLoadWeek}
    onClear={onClearWeekly}
    onOpenFantasyPros={onOpenWeekly}
  />
{/snippet}

<Drawer
  label="Manage team data"
  closeLabel="Close team data"
  eyebrow="Team Manager"
  title="Manage data"
  icon="database"
  initialFocus={section ? SECTION_FOCUS[section] : undefined}
  {onClose}
>
  <TeamDataLeadBlock
    bind:this={leadBlock}
    {lead}
    resetKey={`${selectedSeason}:${selectedWeek}:${weeklySummary?.appliedAt}`}
    showChangeWeek={Boolean(teamState && teamState.seasonPhase !== "preseason" && teamState.seasonPhase !== "postseason" && lead.action?.kind !== "choose-week")}
    bind:error={weeklyError}
    isImporting={isImportingWeekly}
    isClearing={isClearingWeekly}
    onImport={onImportWeekly}
    onOpenSource={(source) => onOpenWeekly(source.position, source.week)}
    onChangeWeek={changeWeek}
    onBack={onLoadWeek}
  />
  {#if teamState?.seasonPhase === "preseason"}
    {@render seasonValueLine()}
    {@render weeklyLine()}
  {:else}
    {@render weeklyLine()}
    {@render seasonValueLine()}
    {#if readiness}
      <TeamCoverageLine {readiness} {weeklySummary} {isLoading} bind:open={coverageOpen} />
    {/if}
  {/if}
</Drawer>

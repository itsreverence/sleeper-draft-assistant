<script lang="ts">
  import type {
    DraftScoringFormat,
    Position,
    SeasonValueRankingImportSummary,
    TeamDataReadiness,
    TeamManagerState,
    WeeklyProjectionImportSummary,
  } from "../types";
  import Icon from "./Icon.svelte";
  import RosRankingsImportPanel from "./RosRankingsImportPanel.svelte";
  import TeamDataReadinessPanel from "./TeamDataReadinessPanel.svelte";
  import WeeklyProjectionsImportPanel from "./WeeklyProjectionsImportPanel.svelte";

  let {
    teamState,
    readiness,
    rosSummary,
    weeklySummary,
    defaultSeason,
    defaultWeek,
    scoring,
    rosError,
    weeklyError,
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

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="drawer-backdrop" type="button" aria-label="Close team data" onclick={onClose}></button>
<div class="data-drawer" role="dialog" aria-modal="true" aria-label="Manage team data">
  <button class="drawer-close" type="button" aria-label="Close team data" title="Close" onclick={onClose}>
    <Icon name="close" size={16} />
  </button>

  <header class="drawer-heading">
    <p class="eyebrow">Team Manager</p>
    <h2><Icon name="database" size={18} /> Manage data</h2>
    <p>Update the evidence Codex uses for weekly and season-value decisions.</p>
  </header>

  <div class="drawer-content">
    <TeamDataReadinessPanel readiness={readiness} seasonPhase={teamState?.seasonPhase} {isLoading} />
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
      error={weeklyError}
      isImporting={isImportingWeekly}
      isClearing={isClearingWeekly}
      onImport={onImportWeekly}
      onLoadContext={onLoadWeek}
      onClear={onClearWeekly}
      onOpenFantasyPros={onOpenWeekly}
    />
  </div>
</div>

<style>
  .drawer-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 0.52);
    cursor: default;
  }

  .data-drawer {
    position: fixed;
    z-index: 41;
    top: 0;
    right: 0;
    width: min(620px, 94vw);
    height: 100vh;
    overflow-y: auto;
    border-left: 1px solid var(--border-strong);
    background: var(--surface-raised);
    box-shadow: -18px 0 50px rgb(0 0 0 / 0.28);
    padding: 48px var(--space-5) var(--space-6);
  }

  .drawer-close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .drawer-close:hover {
    border-color: var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .drawer-heading {
    display: grid;
    gap: 7px;
    margin-bottom: var(--space-5);
  }

  .drawer-heading h2 {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: var(--text-xl);
  }

  .drawer-heading p:last-child {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .drawer-content {
    display: grid;
    gap: var(--space-4);
  }

  @media (max-width: 560px) {
    .data-drawer {
      top: auto;
      bottom: 0;
      width: 100%;
      height: min(92vh, 840px);
      border-top: 1px solid var(--border-strong);
      border-left: 0;
    }
  }
</style>

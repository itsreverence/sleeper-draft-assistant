<script lang="ts">
  import type {
    RosRankingImportSummary,
    TeamDataReadiness,
    TeamManagerState,
    TeamWeekContext,
    WeeklyProjectionImportSummary,
  } from "../types";
  import { formatSleeperStatusSummary, formatSleeperStatusTitle, formatWeeklyProjection } from "../format";

  let {
    state,
    readiness = null,
    weekContext = null,
    selectedWeek = null,
    rosSummary = null,
    weeklySummary = null,
    error = "",
    isLoading = false,
    onManageData,
  }: {
    state: TeamManagerState | null;
    readiness?: TeamDataReadiness | null;
    weekContext?: TeamWeekContext | null;
    selectedWeek?: number | null;
    rosSummary?: RosRankingImportSummary | null;
    weeklySummary?: WeeklyProjectionImportSummary | null;
    error?: string;
    isLoading?: boolean;
    onManageData?: () => void;
  } = $props();

  const reserveGroups = $derived(state ? [
    { label: "Bench", players: state.roster.bench },
    { label: "Injured reserve", players: state.roster.injuredReserve ?? [] },
    { label: "Taxi", players: state.roster.taxi ?? [] },
  ] : []);
  const rosterPlayers = $derived(state ? [
    ...state.roster.starters.map((slot) => slot.player).filter((player) => player !== null),
    ...state.roster.bench,
    ...(state.roster.injuredReserve ?? []),
    ...(state.roster.taxi ?? []),
  ] : []);
  const flaggedPlayers = $derived(rosterPlayers.filter((player) => Boolean(formatSleeperStatusSummary(player))));
  const showProjections = $derived(readiness
    ? readiness.projectedRosterPlayers > 0
    : rosterPlayers.some((player) => player.projectionSource === "weekly_projection"));
  const sourceCount = $derived(Number(Boolean(rosSummary)) + Number(Boolean(weeklySummary)));
  const effectiveWeek = $derived(selectedWeek ?? weekContext?.week ?? state?.week ?? null);
  const activeWeekSuffix = $derived(
    selectedWeek && state?.week && selectedWeek !== state.week ? ` · Active Week ${state.week}` : "",
  );
  const periodLabel = $derived(
    state?.seasonPhase === "preseason"
      ? "Preseason"
      : state?.seasonPhase === "postseason"
        ? "Postseason"
        : effectiveWeek
          ? weekContext?.opponentTeamName
            ? `Week ${effectiveWeek} vs ${weekContext.opponentTeamName}${activeWeekSuffix}`
            : `Week ${effectiveWeek}${activeWeekSuffix}`
          : "Season",
  );
  const teamContextLabel = $derived(state
    ? [
        periodLabel,
        state.league.scoring.toUpperCase(),
        `${rosterPlayers.length} player${rosterPlayers.length === 1 ? "" : "s"}`,
      ].join(" · ")
    : periodLabel);
  const dataLabel = $derived(
    state?.seasonPhase === "preseason"
      ? readiness
        ? `Data: ${sourceCount}/2 sources`
        : "Manage data"
      : readiness
        ? `Data: ${readiness.confidence} confidence`
        : "Manage data",
  );
  const weeklyDataTitle = $derived(
    !weeklySummary ? "Weekly missing" : readiness?.status === "ready" ? "Weekly ready" : "Weekly needs review",
  );
  const dataTitle = $derived(`${sourceCount}/2 sources · ${rosSummary ? "ROS ready" : "ROS missing"} · ${weeklyDataTitle}`);
</script>

<article class="panel roster-panel">
  <header class="roster-heading">
    <div>
      <h2>{state?.userTeam.name ?? "My Team"}</h2>
      {#if teamContextLabel}<p>{teamContextLabel}</p>{/if}
    </div>
    {#if state}
      <div class="roster-signals">
        <span class:attention={flaggedPlayers.length > 0}>Status: {flaggedPlayers.length ? `${flaggedPlayers.length} flagged` : "Clear"}</span>
        <button type="button" aria-label="Manage team data" title={dataTitle} disabled={!onManageData} onclick={() => onManageData?.()}>{dataLabel}</button>
      </div>
    {/if}
  </header>

  {#if isLoading}
    <p class="empty">Loading Sleeper roster...</p>
  {:else if error}
    <p class="empty warning-copy">{error}</p>
  {:else if state}
    <div class="slot-list" aria-label="Starting lineup">
      <div class:with-projections={showProjections} class="column-head">
        <span>Slot</span>
        <span>Player</span>
        {#if showProjections}<span>Projection</span>{/if}
        <span>Status</span>
      </div>
      {#each state.roster.starters as slot, index}
        <div class:with-projections={showProjections} class="slot-row">
          <span class="slot-label">{slot.slot}</span>
          {#if slot.player}
            <span class="player-name">
              <strong>{slot.player.name}</strong>
              <small>{slot.player.team} · {slot.player.position}</small>
            </span>
            {#if showProjections}<span class="projection">{formatWeeklyProjection(slot.player) ?? "Not matched"}</span>{/if}
            <span class:warning-status={Boolean(formatSleeperStatusSummary(slot.player))} class="player-status" title={formatSleeperStatusTitle(slot.player)}>{formatSleeperStatusSummary(slot.player) ?? "Clear"}</span>
          {:else}
            <span class="player-name muted"><strong>Open starter slot {index + 1}</strong><small>{slot.eligiblePositions.join("/")}</small></span>
            {#if showProjections}<span class="projection muted">Open slot</span>{/if}
            <span class="player-status warning-status">Open</span>
          {/if}
        </div>
      {/each}
    </div>

    {#each reserveGroups as group}
      {#if group.players.length > 0}
        <div class="reserve-line">
          <span>{group.label}</span>
          <div>
            {#each group.players as player}
              <small class:warning-status={Boolean(formatSleeperStatusSummary(player))} title={formatSleeperStatusTitle(player)}>
                {player.name}<i>{player.position}</i>{#if showProjections}<i>{formatWeeklyProjection(player) ?? "Not matched"}</i>{/if}{#if formatSleeperStatusSummary(player)}<i>{formatSleeperStatusSummary(player)}</i>{/if}
              </small>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  {:else}
    <p class="empty">Open a Sleeper league to load team-manager context.</p>
  {/if}
</article>

<style>
  .roster-panel { overflow: hidden; padding: 0; }
  .roster-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 14px 16px 11px; }
  .roster-heading h2 { font-size: var(--text-lg); }
  .roster-heading p { margin-top: 2px; color: var(--text-muted); font-size: var(--text-xs); }
  .roster-signals { display: flex; gap: 14px; align-items: center; color: var(--text-muted); font-size: var(--text-xs); font-weight: 750; }
  .roster-signals .attention { color: var(--warning); }
  .roster-signals button { border: 0; padding: 0; background: transparent; color: var(--text-muted); cursor: pointer; font: inherit; }
  .roster-signals button:hover:not(:disabled) { color: var(--accent); }
  .roster-signals button:disabled { cursor: default; }
  .slot-list { border-top: 1px solid var(--border); }
  .column-head,
  .slot-row { display: grid; grid-template-columns: 48px minmax(200px, 1fr) minmax(120px, .32fr); gap: 12px; align-items: center; }
  .column-head.with-projections,
  .slot-row.with-projections { grid-template-columns: 48px minmax(200px, 1fr) 105px minmax(120px, .32fr); }
  .column-head { min-height: 28px; padding: 4px 16px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: var(--text-2xs); font-weight: 850; text-transform: uppercase; }
  .column-head span:last-child { text-align: right; }
  .slot-row { min-height: 44px; padding: 5px 16px; border-bottom: 1px solid var(--border); }
  .slot-label { color: var(--text-muted); font-size: var(--text-xs); font-weight: 800; }
  .player-name { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  .player-name strong { overflow: hidden; color: var(--text-primary); font-size: var(--text-sm); text-overflow: ellipsis; white-space: nowrap; }
  .player-name small { flex: 0 0 auto; color: var(--text-muted); font-size: var(--text-2xs); }
  .player-name.muted strong { color: var(--text-secondary); }
  .projection { color: var(--accent); font-size: var(--text-xs); font-weight: 800; }
  .projection.muted { color: var(--text-muted); font-weight: 700; }
  .player-status { color: var(--text-muted); font-size: var(--text-xs); text-align: right; }
  .warning-status { color: var(--warning) !important; }
  .reserve-line { display: grid; grid-template-columns: 60px 1fr; gap: 12px; padding: 11px 16px; }
  .reserve-line + .reserve-line { border-top: 1px solid var(--border); }
  .reserve-line > span { color: var(--text-muted); font-size: var(--text-2xs); font-weight: 850; text-transform: uppercase; }
  .reserve-line > div { display: flex; flex-wrap: wrap; gap: 6px 12px; }
  .reserve-line small { color: var(--text-secondary); font-size: var(--text-xs); font-weight: 700; }
  .reserve-line i { margin-left: 4px; color: var(--text-muted); font-size: var(--text-2xs); font-style: normal; }
  .empty { padding: 16px; }
  .warning-copy { color: var(--warning); }
  @media (max-width: 720px) {
    .roster-heading { align-items: start; flex-direction: column; }
    .column-head { display: none; }
    .slot-row,
    .slot-row.with-projections { grid-template-columns: 42px minmax(0, 1fr) auto; }
    .slot-row .projection { display: none; }
    .player-status { text-align: right; }
    .player-name { align-items: start; flex-direction: column; gap: 2px; }
  }
</style>

<script lang="ts">
  import type {
    Player,
    SeasonValueRankingImportSummary,
    TeamDataReadiness,
    TeamManagerState,
    TeamWeekContext,
    WeeklyProjectionImportSummary,
  } from "../types";
  import {
    effectiveTeamWeek,
    formatConfidence,
    formatMissingProjection,
    formatPlayerSchedule,
    formatRosterSlot,
    formatSleeperStatusSummary,
    formatSleeperStatusTitle,
    formatWeeklyProjection,
    rosterStatus,
    rosterSlotTitle,
  } from "../format";
  import Icon from "./Icon.svelte";

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
    rosSummary?: SeasonValueRankingImportSummary | null;
    weeklySummary?: WeeklyProjectionImportSummary | null;
    error?: string;
    isLoading?: boolean;
    onManageData?: () => void;
  } = $props();

  const reserveGroups = $derived(state ? [
    { label: "Bench", slot: "BN", players: state.roster.bench },
    { label: "Injured reserve", slot: "IR", players: state.roster.injuredReserve ?? [] },
    { label: "Taxi", slot: "TAXI", players: state.roster.taxi ?? [] },
  ] : []);
  const rosterPlayers = $derived(state ? [
    ...state.roster.starters.map((slot) => slot.player).filter((player) => player !== null),
    ...state.roster.bench,
    ...(state.roster.injuredReserve ?? []),
    ...(state.roster.taxi ?? []),
  ] : []);
  const flaggedCount = $derived(rosterPlayers.filter((player) => Boolean(formatSleeperStatusSummary(player))).length);
  const startersOnBye = $derived(state?.roster.starters.filter((slot) => slot.player?.schedule?.onBye === true).length ?? 0);
  const showProjections = $derived(readiness
    ? readiness.projectedRosterPlayers > 0
    : rosterPlayers.some((player) => player.projectionSource === "weekly_projection"));
  const sourceCount = $derived(Number(Boolean(rosSummary)) + Number(Boolean(weeklySummary)));
  const isPreseason = $derived(state?.seasonPhase === "preseason");
  const weekHeading = $derived(
    state?.seasonPhase === "preseason" || state?.seasonPhase === "postseason"
      ? "Week"
      : `Week ${effectiveTeamWeek(state, weekContext, selectedWeek) ?? ""}`.trim(),
  );
  const rosterSummary = $derived([
    `${rosterPlayers.length} player${rosterPlayers.length === 1 ? "" : "s"}`,
    ...(startersOnBye > 0 ? [`${startersOnBye} starter${startersOnBye === 1 ? "" : "s"} on bye`] : []),
    ...(flaggedCount > 0 ? [`${flaggedCount} flagged`] : []),
  ].join(" · "));
  const weeklyDataTitle = $derived(
    !weeklySummary ? "Weekly missing" : readiness?.status === "ready" ? "Weekly ready" : "Weekly needs review",
  );
  const seasonValueTitle = $derived(
    !rosSummary
      ? "Season value missing"
      : rosSummary.rankingType === "ros-ecr"
        ? "ROS ready"
        : state?.seasonPhase === "regular" && (state.week ?? 0) >= 2
          ? "Draft ECR fallback · ROS update recommended"
          : "Draft ECR fallback",
  );
  const dataTitle = $derived(`${sourceCount}/2 sources · ${seasonValueTitle} · ${weeklyDataTitle}`);
  const coverage = $derived(readiness && !isPreseason ? Math.round(readiness.rosterProjectionCoverage * 100) : null);
  const coverageDetail = $derived(readiness ? [
    ...(readiness.loadedPositions.length > 0 ? [`${positionList(readiness.loadedPositions)} loaded`] : []),
    ...readiness.missingPositions.map((position) => {
      const result = weeklySummary?.positionResults.find((item) => item.position === position);
      return `${positionList([position])}: ${result?.matched === 0 ? result.rowsParsed === 0 ? "no rows" : "no matches" : "missing"}`;
    }),
  ].join(" · ") : "");
  const scheduleUnavailable = $derived(state?.scheduleStatus?.available === false);

  function positionList(positions: string[]) {
    return positions.map((position) => (position === "DEF" ? "DST" : position)).join(", ");
  }
</script>

{#snippet byeChip(player: Player)}
  <span class="bye-chip" role="img" aria-label={`On bye in Week ${player.schedule?.week}`}>BYE</span>
{/snippet}

{#snippet playerRow(slot: string, player: Player)}
  {@const status = rosterStatus(player)}
  <tr class="slot-row">
    <td class="slot-label" title={rosterSlotTitle(slot)} aria-label={rosterSlotTitle(slot)}>{formatRosterSlot(slot)}</td>
    <th scope="row">
      <div class="player-name">
        <span class={`pos-chip position-${player.position.toLowerCase()}`}>{player.position}</span>
        <div class="player-identity">
          <strong>{player.name}</strong>
          <small class:danger={status?.tone === "danger"} data-status={status?.injury ? status.label : undefined}>{player.team}</small>
          {#if status?.injury && formatSleeperStatusTitle(player)}
            <details class="status-details">
              <summary>Status details<span class="sr-only"> for {player.name}</span></summary>
              <span>{formatSleeperStatusTitle(player)}</span>
            </details>
          {/if}
        </div>
      </div>
    </th>
    <td class="week-cell">
      {#if player.schedule?.onBye}
        {@render byeChip(player)}
      {:else}
        {formatPlayerSchedule(player) ?? "—"}
      {/if}
    </td>
    {#if showProjections}
      <td class="projection" class:muted={player.schedule?.onBye || !formatWeeklyProjection(player)}>{formatWeeklyProjection(player) ?? formatMissingProjection(player, weeklySummary)}</td>
    {/if}
    <td class={`player-status ${status ? `tone-${status.tone}` : ""}`} title={status ? formatSleeperStatusTitle(player) : undefined}>
      {#if status}<span aria-hidden={status.injury ? undefined : "true"}>{status.label}</span>{/if}
    </td>
  </tr>
{/snippet}

<article class="panel roster-panel">
  <header class="roster-heading">
    <div>
      <h2>{state?.userTeam.name ?? "My Team"}</h2>
      {#if state}<p>{rosterSummary}</p>{/if}
    </div>
    {#if state}
      <div class="roster-signals">
        {#if isPreseason}
          {#if readiness}<span class="pill pill-neutral">Data: {sourceCount}/2 sources</span>{/if}
        {:else if readiness}
          <span
            class="pill"
            class:pill-ready={readiness.confidence === "high"}
            class:pill-warning={readiness.confidence === "medium"}
            class:pill-neutral={readiness.confidence === "low"}
          >{formatConfidence(readiness.confidence)} · {readiness.projectedRosterPlayers}/{readiness.eligibleRosterPlayers} projected</span>
        {/if}
        <button class="pill pill-neutral manage-data" type="button" aria-label="Manage team data" title={dataTitle} disabled={!onManageData} onclick={() => onManageData?.()}>Manage data<Icon name="chevron-right" size={13} /></button>
      </div>
    {/if}
  </header>

  {#if isLoading}
    <p class="empty">Loading Sleeper roster...</p>
  {:else if error}
    <p class="empty warning-copy">{error}</p>
  {:else if state}
    <table class="roster-table" aria-label="Starting lineup and reserves">
      <thead>
        <tr>
          <th class="slot-label" scope="col">Slot</th>
          <th scope="col">Player</th>
          <th class="week-cell" scope="col">{weekHeading}</th>
          {#if showProjections}<th class="projection" scope="col">Proj</th>{/if}
          <th class="player-status" scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each state.roster.starters as slot, index}
          {#if slot.player}
            {@render playerRow(slot.slot, slot.player)}
          {:else}
            <tr class="slot-row">
              <td class="slot-label" title={rosterSlotTitle(slot.slot)} aria-label={rosterSlotTitle(slot.slot)}>{formatRosterSlot(slot.slot)}</td>
              <th class="open-slot" scope="row">
                <span class="player-identity"><strong>Open starter slot {index + 1}</strong><small>{slot.eligiblePositions.join("/")}</small></span>
              </th>
              <td class="week-cell">—</td>
              {#if showProjections}<td class="projection muted">—</td>{/if}
              <td class="player-status tone-warning">Open</td>
            </tr>
          {/if}
        {/each}
      </tbody>
      {#each reserveGroups as group}
        {#if group.players.length > 0}
          <tbody>
            <tr class="group-row"><th colspan={showProjections ? 5 : 4} scope="rowgroup">{group.label}</th></tr>
            {#each group.players as player}
              {@render playerRow(group.slot, player)}
            {/each}
          </tbody>
        {/if}
      {/each}
    </table>

    {#if coverage !== null || scheduleUnavailable}
      <footer class="readiness-footer">
        {#if coverage !== null && readiness}
          <div class="coverage">
            <div class="coverage-track" class:ready={readiness.status === "ready"} role="meter" aria-label="Roster projection coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage}>
              <span style={`width:${coverage}%`}></span>
            </div>
            <p><strong>{coverage}% roster coverage</strong>{coverageDetail ? ` · ${coverageDetail}` : ""}</p>
            {#if readiness.status !== "ready" && onManageData}
              <button class="btn btn-ghost" type="button" onclick={() => onManageData?.()}>Import weekly projections</button>
            {/if}
          </div>
        {/if}
        {#if scheduleUnavailable}
          <p class="schedule-note"><Icon name="alert" size={14} />NFL schedule unavailable. Byes from your draft imports still show; other byes are unknown. Refresh to try again.</p>
        {/if}
      </footer>
    {/if}
  {:else}
    <p class="empty">Open a Sleeper league to load team-manager context.</p>
  {/if}
</article>

<style>
  .roster-panel { overflow: hidden; padding: 0; }
  .roster-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2) var(--space-4); align-items: flex-start; padding: var(--space-4); }
  .roster-heading h2 { font-size: var(--text-xl); }
  .roster-heading p { margin-top: 2px; color: var(--text-muted); font-size: var(--text-md); font-variant-numeric: tabular-nums; }
  .roster-signals { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .roster-signals .pill { flex-shrink: 1; font-variant-numeric: tabular-nums; white-space: normal; }
  .manage-data { gap: 2px; cursor: pointer; font-family: inherit; }
  .manage-data:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
  .manage-data:disabled { cursor: default; }

  .roster-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: var(--text-base); }
  .roster-table th { font-weight: 400; text-align: left; }
  .roster-table thead th { height: 32px; padding: 0 var(--space-2); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; line-height: 1.3; text-transform: uppercase; }
  .roster-table tr { border-top: 1px solid var(--border); }
  .slot-row td,
  .slot-row th { height: 44px; padding: var(--space-1) var(--space-2); vertical-align: middle; }
  .roster-table tr > :first-child { padding-left: var(--space-4); }
  .roster-table tr > :last-child { padding-right: var(--space-4); }
  thead .slot-label { width: 68px; }
  thead .week-cell { width: 104px; }
  thead .projection { width: 104px; }
  thead .player-status { width: 28%; }

  .slot-label { overflow-wrap: anywhere; color: var(--text-muted); font-size: var(--text-sm); font-weight: 600; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .status-details { display: none; flex-basis: 100%; min-width: 0; font-size: var(--text-sm); color: var(--text-muted); overflow-wrap: anywhere; }
  .status-details summary { cursor: pointer; }
  .player-name { display: flex; gap: var(--space-2); align-items: center; min-width: 0; }
  .player-identity { display: flex; flex-wrap: wrap; gap: 0 var(--space-2); align-items: baseline; min-width: 0; }
  .player-identity strong { min-width: 0; color: var(--text-primary); font-weight: 600; overflow-wrap: anywhere; }
  .player-identity small { color: var(--text-muted); font-size: var(--text-sm); }
  .open-slot strong { color: var(--text-secondary); font-weight: 500; }

  .pos-chip { display: inline-grid; flex-shrink: 0; place-items: center; width: 34px; height: 24px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--position-color) 18%, transparent); color: var(--position-color); font-size: var(--text-xs); font-weight: 600; }
  .position-qb { --position-color: var(--pos-qb); }
  .position-rb { --position-color: var(--pos-rb); }
  .position-wr { --position-color: var(--pos-wr); }
  .position-te { --position-color: var(--pos-te); }
  .position-k { --position-color: var(--pos-k); }
  .position-def { --position-color: var(--pos-def); }

  .week-cell { color: var(--text-secondary); font-size: var(--text-md); font-variant-numeric: tabular-nums; }
  .bye-chip { display: inline-block; border: 1px solid var(--warning-border); border-radius: var(--radius-sm); background: var(--warning-soft); color: var(--warning); font-size: var(--text-sm); font-weight: 600; line-height: 1.4; padding: 0 var(--space-2); }

  .roster-table .projection { color: var(--text-primary); font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
  .roster-table thead .projection { color: var(--text-muted); }
  .roster-table .projection.muted { color: var(--text-muted); font-size: var(--text-sm); font-weight: 400; }

  .roster-table .player-status { text-align: right; }
  tbody .player-status { font-size: var(--text-md); }
  .roster-table .player-status.tone-warning { color: var(--warning); font-weight: 600; }
  .roster-table .player-status.tone-danger { color: var(--danger); font-weight: 600; }

  .group-row th { height: 32px; padding: 0 var(--space-4); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; line-height: 1.3; text-transform: uppercase; }

  .readiness-footer { display: grid; gap: var(--space-2); border-top: 1px solid var(--border); padding: var(--space-2) var(--space-4); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--text-sm); }
  .coverage { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); align-items: center; min-height: 36px; }
  .coverage p { flex: 1 1 200px; min-width: 0; }
  .coverage strong { color: var(--text-secondary); font-weight: 600; font-variant-numeric: tabular-nums; }
  .coverage .btn { min-height: 32px; padding: 0 var(--space-3); font-size: var(--text-sm); }
  .coverage-track { flex: 0 0 120px; height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
  .coverage-track span { display: block; height: 100%; border-radius: inherit; background: var(--warning); }
  .coverage-track.ready span { background: var(--accent); }
  .schedule-note { display: flex; gap: var(--space-2); align-items: flex-start; color: var(--warning); line-height: 1.4; }
  .schedule-note :global(svg) { flex-shrink: 0; margin-top: 1px; }

  .empty { padding: 16px; }
  .warning-copy { color: var(--warning); }

  @media (max-width: 760px) {
    /* The Status column and its hover details are hidden at this width. */
    .status-details { display: block; }

    /* Auto layout keeps the colspan's implied columns for the hidden Proj and Status at zero width. */
    .roster-table { table-layout: auto; }
    .roster-table .projection,
    .roster-table .player-status { display: none; }
    thead .slot-label { width: 60px; }
    thead .week-cell { width: 84px; }
    .roster-table .week-cell { text-align: right; }
    .player-identity { flex-direction: column; flex-wrap: nowrap; gap: 0; }
    /* The Status column is hidden here, so an injury flag rides on the team line. Bye stays on the Week chip. */
    .player-identity small[data-status]::after { content: " · " attr(data-status); color: var(--warning); font-weight: 600; }
    .player-identity small.danger[data-status]::after { color: var(--danger); }
  }
</style>

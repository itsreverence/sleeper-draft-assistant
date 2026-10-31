<script lang="ts">
  import LiveAnnouncer from "./LiveAnnouncer.svelte";
  import PositionChip from "./PositionChip.svelte";
  import Icon from "./Icon.svelte";
  import TeamAttention from "./TeamAttention.svelte";
  import type {
    Player,
    TeamDataReadiness,
    TeamManagerState,
    TeamWeekContext,
    WeeklyProjectionImportSummary,
  } from "../types";
  import {
    effectiveTeamWeek,
    formatMissingProjection,
    formatPlayerSchedule,
    formatRosterSlot,
    formatSleeperStatusTitle,
    formatWeeklyProjection,
    rosterStatus,
    rosterSlotTitle,
    type RosterStatus,
  } from "../format";
  import { lineupAnnouncement, lineupCheck, starterAttention, starterRowId, type StarterAttention, type TeamDataSection } from "../team-attention";

  let {
    state: team,
    readiness = null,
    weekContext = null,
    selectedWeek = null,
    weeklySummary = null,
    error = "",
    isLoading = false,
    refreshFailed = false,
    canAsk = false,
    onManageData,
    onAsk,
  }: {
    state: TeamManagerState | null;
    readiness?: TeamDataReadiness | null;
    weekContext?: TeamWeekContext | null;
    selectedWeek?: number | null;
    weeklySummary?: WeeklyProjectionImportSummary | null;
    error?: string;
    isLoading?: boolean;
    refreshFailed?: boolean;
    canAsk?: boolean;
    onManageData?: (section: TeamDataSection) => void;
    onAsk?: (question: string) => void;
  } = $props();

  let reservesOpen = $state(false);

  const check = $derived(team ? lineupCheck({ state: team, weekContext, selectedWeek, weeklySummary, refreshFailed }) : null);
  const flags = $derived(starterAttention(check));
  const reserveGroups = $derived(team ? [
    { id: "team-reserve-bench", label: "Bench", slot: "BN", players: team.roster.bench },
    { id: "team-reserve-ir", label: "Injured reserve", slot: "IR", players: team.roster.injuredReserve ?? [] },
    { id: "team-reserve-taxi", label: "Taxi", slot: "TAXI", players: team.roster.taxi ?? [] },
  ].filter((group) => group.players.length > 0) : []);
  const reserveSummary = $derived(reserveGroups.map((group) => `${group.label} (${group.players.length})`).join(" · "));
  const showProjections = $derived(readiness
    ? readiness.projectedRosterPlayers > 0
    : Boolean(team && [
        ...team.roster.starters.map((slot) => slot.player),
        ...team.roster.bench,
        ...(team.roster.injuredReserve ?? []),
        ...(team.roster.taxi ?? []),
      ].some((player) => player?.projectionSource === "weekly_projection")));
  const columnCount = $derived(showProjections ? 5 : 4);
  const weekHeading = $derived(
    team?.seasonPhase === "preseason" || team?.seasonPhase === "postseason"
      ? "Week"
      : `Week ${effectiveTeamWeek(team, weekContext, selectedWeek) ?? ""}`.trim(),
  );
  const announcementScope = $derived(team ? `${team.league.id}:${team.userTeam.rosterId}` : "");
</script>

{#snippet slotCell(slot: string)}
  <td class="slot-label" title={rosterSlotTitle(slot)} aria-label={rosterSlotTitle(slot)}>{formatRosterSlot(slot)}</td>
{/snippet}

{#snippet askControl(flag: StarterAttention, subject: string)}
  <button class="row-ask" type="button" aria-label={`Ask about ${subject}`} onclick={() => onAsk?.(flag.question)}>
    Ask<Icon name="chevron-right" size={12} />
  </button>
{/snippet}

{#snippet statusContent(status: RosterStatus | null, flag: StarterAttention | undefined, subject: string)}
  {#if status}<span class={`status-text tone-${status.tone}`} aria-hidden={status.injury ? undefined : "true"}>{status.label}</span>{/if}
  {#if flag && canAsk}{@render askControl(flag, subject)}{/if}
{/snippet}

{#snippet playerRow(slot: string, player: Player, rowId?: string)}
  {@const status = rosterStatus(player)}
  {@const flag = rowId ? flags.get(rowId) : undefined}
  {@const projection = formatWeeklyProjection(player)}
  <tr class={`slot-row ${flag ? `flagged flag-${flag.tone}` : ""}`} id={rowId} tabindex={rowId ? -1 : undefined}>
    {@render slotCell(slot)}
    <th scope="row">
      <div class="player-name">
        <PositionChip position={player.position} />
        <div class="player-identity">
          <strong>{player.name}</strong>
          <small>{player.team}</small>
          {#if status || flag}
            <div class="compact-status">{@render statusContent(status, flag, player.name)}</div>
          {/if}
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
        <span class="bye-chip" role="img" aria-label={`On bye in Week ${player.schedule.week}`}>BYE</span>
      {:else}
        {formatPlayerSchedule(player) ?? "–"}
      {/if}
    </td>
    {#if showProjections}
      <td class="projection" class:muted={!projection}>
        {#if projection}
          {projection}
        {:else if player.schedule?.onBye}
          <span aria-hidden="true">–</span>
        {:else}
          {@const reason = formatMissingProjection(player, weeklySummary)}
          <span aria-hidden="true" title={reason}>–</span><span class="sr-only">{reason}</span>
        {/if}
      </td>
    {/if}
    <td class="player-status" title={status ? formatSleeperStatusTitle(player) : undefined}>
      <div class="status-line">{@render statusContent(status, flag, player.name)}</div>
    </td>
  </tr>
{/snippet}

<LiveAnnouncer scope={announcementScope} message={lineupAnnouncement(check)} />

{#if isLoading}
  <div class="lineup-frame"><p class="empty">Loading Sleeper roster...</p></div>
{:else if error}
  <div class="lineup-frame"><p class="empty warning-copy">{error}</p></div>
{:else if team && check}
  <TeamAttention {check} {onManageData} />

  <div class="lineup-frame">
    <table class="lineup" aria-label="Starting lineup and reserves">
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
        {#each team.roster.starters as slot, index}
          {@const rowId = starterRowId(index)}
          {#if slot.player}
            {@render playerRow(slot.slot, slot.player, rowId)}
          {:else}
            {@const flag = flags.get(rowId)}
            {@const status: RosterStatus = { label: "Open", tone: "warning", injury: true }}
            {@const subject = `the open ${formatRosterSlot(slot.slot)} slot`}
            <tr class={`slot-row ${flag ? `flagged flag-${flag.tone}` : ""}`} id={rowId} tabindex="-1">
              {@render slotCell(slot.slot)}
              <th class="open-slot" scope="row">
                <span class="player-identity">
                  <strong>Open slot</strong>
                  <small>{slot.eligiblePositions.join("/")}</small>
                  <div class="compact-status">{@render statusContent(status, flag, subject)}</div>
                </span>
              </th>
              <td class="week-cell">–</td>
              {#if showProjections}<td class="projection muted">–</td>{/if}
              <td class="player-status"><div class="status-line">{@render statusContent(status, flag, subject)}</div></td>
            </tr>
          {/if}
        {/each}
      </tbody>
      {#if reserveGroups.length > 0}
        <tbody>
          <tr class="reserve-toggle">
            <td colspan={columnCount}>
              <button
                type="button"
                aria-expanded={reservesOpen}
                aria-controls={reservesOpen ? reserveGroups.map((group) => group.id).join(" ") : undefined}
                onclick={() => (reservesOpen = !reservesOpen)}
              >
                {reserveSummary}<Icon name="chevron-right" size={12} />
              </button>
            </td>
          </tr>
        </tbody>
        {#if reservesOpen}
          {#each reserveGroups as group (group.id)}
            <tbody id={group.id}>
              {#if reserveGroups.length > 1}
                <tr class="group-row"><th colspan={columnCount} scope="rowgroup">{group.label}</th></tr>
              {/if}
              {#each group.players as player (player.id)}
                {@render playerRow(group.slot, player)}
              {/each}
            </tbody>
          {/each}
        {/if}
      {/if}
    </table>
  </div>
{:else}
  <div class="lineup-frame"><p class="empty">Open a Sleeper league to load team-manager context.</p></div>
{/if}

<style>
  .lineup-frame { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; }

  .lineup { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: var(--text-base); }
  .lineup th { font-weight: 400; text-align: left; }
  .lineup thead th { height: 32px; padding: 0 var(--space-2); color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; line-height: 1.3; text-transform: uppercase; }
  .slot-row td,
  .slot-row th { height: 44px; border-top: 1px solid var(--border); padding: var(--space-1) var(--space-2); vertical-align: middle; }
  .lineup tr > :first-child { padding-left: var(--space-4); }
  .lineup tr > :last-child { padding-right: var(--space-4); }
  thead .slot-label { width: 72px; }
  thead .week-cell { width: 88px; }
  thead .projection { width: 64px; }
  thead .player-status { width: 248px; }

  .slot-row:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
  .flagged td,
  .flagged th { background: var(--warning-soft); }
  .flag-warning > :first-child { box-shadow: inset 3px 0 0 var(--warning); }
  .flag-danger > :first-child { box-shadow: inset 3px 0 0 var(--danger); }

  .slot-label { overflow-wrap: anywhere; color: var(--text-muted); font-size: var(--text-sm); font-weight: 600; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .player-name { display: flex; gap: var(--space-3); align-items: center; min-width: 0; }
  .player-identity { display: flex; flex-wrap: wrap; gap: 0 var(--space-2); align-items: baseline; min-width: 0; }
  .player-identity strong { min-width: 0; color: var(--text-primary); font-weight: 600; overflow-wrap: anywhere; }
  .player-identity small { color: var(--text-muted); font-size: var(--text-sm); }
  .open-slot strong { color: var(--text-secondary); font-weight: 500; }

  .week-cell { color: var(--text-secondary); font-size: var(--text-md); font-variant-numeric: tabular-nums; }
  .bye-chip { display: inline-block; border: 1px solid var(--warning-border); border-radius: var(--radius-sm); background: var(--warning-soft); color: var(--warning); font-size: var(--text-sm); font-weight: 600; line-height: 1.4; padding: 0 var(--space-2); }

  .lineup .projection { color: var(--text-primary); font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
  .lineup thead .projection { color: var(--text-muted); }
  .lineup .projection.muted { color: var(--text-muted); font-weight: 400; }

  .lineup .player-status { padding-left: var(--space-4); }
  .status-line,
  .compact-status { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--space-3); min-width: 0; }
  .status-text { font-size: var(--text-md); font-weight: 600; overflow-wrap: anywhere; }
  .tone-warning { color: var(--warning); }
  .tone-danger { color: var(--danger); }
  .row-ask { display: inline-flex; align-items: center; gap: 2px; min-height: 24px; border: 0; border-radius: var(--radius-sm); background: transparent; padding: 0 var(--space-1); color: var(--text-primary); cursor: pointer; font-size: var(--text-sm); font-weight: 500; text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 3px; }
  .row-ask:hover { background: var(--surface-hover); }

  .compact-status,
  .status-details { display: none; }
  .status-details { flex-basis: 100%; min-width: 0; color: var(--text-muted); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .status-details summary { cursor: pointer; }

  .reserve-toggle td { border-top: 1px solid var(--border); }
  .lineup .reserve-toggle td:first-child { padding: 0; }
  .reserve-toggle button { display: flex; align-items: center; gap: var(--space-1); width: 100%; min-height: 44px; border: 0; background: transparent; padding: var(--space-1) var(--space-4); color: var(--text-secondary); cursor: pointer; font-size: var(--text-md); font-variant-numeric: tabular-nums; text-align: left; }
  .reserve-toggle button:hover { background: var(--surface-raised); color: var(--text-primary); }
  .reserve-toggle button:focus-visible { outline-offset: -2px; }
  .reserve-toggle button > :global(.icon) { flex-shrink: 0; transition: transform var(--transition-fast); }
  .reserve-toggle button[aria-expanded="true"] > :global(.icon) { transform: rotate(90deg); }
  .group-row th { height: 32px; border-top: 1px solid var(--border); padding: 0 var(--space-4); color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; line-height: 1.3; text-transform: uppercase; }

  .empty { padding: var(--space-4); }
  .warning-copy { color: var(--warning); }

  @media (max-width: 520px) {
    /* Auto layout keeps the colspan's implied Status column at zero width once it is hidden. */
    .lineup { table-layout: auto; }
    .lineup thead th { white-space: nowrap; }
    .lineup .player-status { display: none; }
    .lineup tr > :first-child { padding-right: var(--space-1); padding-left: var(--space-3); }
    .lineup tr > :nth-last-child(2) { padding-right: var(--space-3); }
    .reserve-toggle button { padding-inline: var(--space-3); }
    thead .slot-label { width: 48px; }
    thead .week-cell { width: 60px; }
    thead .projection { width: 52px; }
    /* The chip sits beside the name while there is room and above it at the narrowest widths. */
    .player-name { flex-wrap: wrap; gap: var(--space-1) var(--space-2); }
    .player-identity { flex: 1 1 88px; flex-direction: column; flex-wrap: nowrap; }
    .compact-status { display: flex; }
    .status-details { display: block; }
  }
</style>

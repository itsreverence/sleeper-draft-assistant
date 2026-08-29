<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { TeamManagerState } from "../types";
  import { formatSleeperStatusSummary, formatSleeperStatusTitle, formatWeeklyProjection } from "../format";

  let { state, error = "", isLoading = false }: { state: TeamManagerState | null; error?: string; isLoading?: boolean } = $props();

  const starterCount = $derived(state?.roster.starters.filter((slot) => slot.player).length ?? 0);
  const starterSlots = $derived(state?.roster.starters.length ?? 0);
  const reserveGroups = $derived(state ? [
    { label: "Bench", players: state.roster.bench },
    { label: "Injured reserve", players: state.roster.injuredReserve ?? [] },
    { label: "Taxi", players: state.roster.taxi ?? [] },
  ] : []);
  const periodLabel = $derived(
    state?.seasonPhase === "preseason"
      ? "Preseason"
      : state?.seasonPhase === "postseason"
        ? "Postseason"
        : state?.week
          ? `Week ${state.week}`
          : "",
  );
</script>

<article class="panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="users" size={17} /> {state?.userTeam.name ?? "My Team"}</h2>
    </div>
    {#if periodLabel}
      <span class="status-pill">{periodLabel}</span>
    {/if}
  </div>

  {#if isLoading}
    <p class="empty">Loading Sleeper roster...</p>
  {:else if error}
    <p class="empty warning">{error}</p>
  {:else if state}
    <div class="team-summary">
      <span>{state.league.scoring}</span>
      <span>{starterCount}/{starterSlots} starters</span>
      <span>{state.roster.bench.length} bench</span>
    </div>

    <div class="slot-list" aria-label="Projected starters">
      {#each state.roster.starters as slot, index}
        <div class="slot-row">
          <span class="slot-label">{slot.slot}</span>
          {#if slot.player}
            <span class="player-name">{slot.player.name}</span>
            <span class="player-meta" title={formatSleeperStatusTitle(slot.player)}>
              {slot.player.team} - {slot.player.position}
              {#if formatWeeklyProjection(slot.player)}
                <strong>{formatWeeklyProjection(slot.player)}</strong>
              {/if}
              {#if formatSleeperStatusSummary(slot.player)}
                <small
                  class="sleeper-status warning-status"
                >{formatSleeperStatusSummary(slot.player)}</small>
              {/if}
            </span>
          {:else}
            <span class="player-name muted">Open starter slot {index + 1}</span>
            <span class="player-meta">{slot.eligiblePositions.join("/")}</span>
          {/if}
        </div>
      {/each}
    </div>

    {#each reserveGroups as group}
      {#if group.players.length > 0}
        <div class="reserve-block">
          <p class="eyebrow">{group.label}</p>
          <div class="player-chips">
            {#each group.players as player}
            <span title={formatSleeperStatusTitle(player)}>
              {player.name}
              <small>{player.position}{formatWeeklyProjection(player) ? ` · ${formatWeeklyProjection(player)}` : ""}</small>
              {#if formatSleeperStatusSummary(player)}
                <small
                  class="sleeper-status warning-status"
                > · {formatSleeperStatusSummary(player)}</small>
              {/if}
            </span>
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
  .panel-heading.compact {
    align-items: start;
  }

  .panel-heading.compact h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: var(--text-lg);
  }

  .status-pill {
    border: 1px solid var(--border-muted);
    border-radius: 999px;
    padding: 4px 8px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .team-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: var(--space-3);
  }

  .team-summary span {
    border: 1px solid var(--border-muted);
    border-radius: 999px;
    padding: 5px 8px;
    background: var(--surface-sunken);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .slot-list {
    display: grid;
    gap: 2px;
  }

  .slot-row {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface-sunken);
  }

  .slot-label,
  .player-meta {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .player-name {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player-name.muted {
    color: var(--text-secondary);
  }

  .player-meta strong {
    margin-left: 5px;
    color: var(--accent);
  }

  .sleeper-status {
    margin-left: 5px;
    color: var(--text-secondary);
    font: inherit;
  }

  .sleeper-status.warning-status {
    color: var(--warning);
  }

  .reserve-block {
    margin-top: var(--space-4);
  }

  .player-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--space-2);
  }

  .player-chips span {
    border-radius: 999px;
    padding: 6px 8px;
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: 750;
  }

  .player-chips small {
    color: var(--text-secondary);
    font-weight: 800;
  }

  .player-chips .sleeper-status {
    margin-left: 0;
  }

  .warning {
    color: var(--warning);
  }

  @media (max-width: 520px) {
    .slot-row {
      grid-template-columns: 48px minmax(0, 1fr);
    }

    .player-meta {
      grid-column: 2;
    }
  }
</style>

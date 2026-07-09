<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { TeamManagerState } from "../types";

  let { state, error = "", isLoading = false }: { state: TeamManagerState | null; error?: string; isLoading?: boolean } = $props();

  const starterCount = $derived(state?.roster.starters.filter((slot) => slot.player).length ?? 0);
  const starterSlots = $derived(state?.roster.starters.length ?? 0);
</script>

<article class="panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="users" size={17} /> {state?.userTeam.name ?? "My Team"}</h2>
    </div>
    {#if state?.week}
      <span class="status-pill">Week {state.week}</span>
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
            <span class="player-meta">{slot.player.team} - {slot.player.position}</span>
          {:else}
            <span class="player-name muted">Open starter slot {index + 1}</span>
            <span class="player-meta">{slot.eligiblePositions.join("/")}</span>
          {/if}
        </div>
      {/each}
    </div>

    {#if state.roster.bench.length > 0}
      <div class="bench-block">
        <p class="eyebrow">Bench</p>
        <div class="bench-list">
          {#each state.roster.bench as player}
            <span>{player.name} <small>{player.position}</small></span>
          {/each}
        </div>
      </div>
    {/if}
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

  .bench-block {
    margin-top: var(--space-4);
  }

  .bench-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--space-2);
  }

  .bench-list span {
    border-radius: 999px;
    padding: 6px 8px;
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: 750;
  }

  .bench-list small {
    color: var(--text-secondary);
    font-weight: 800;
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

<script lang="ts">
  import Icon from "./Icon.svelte";
  import { starterSlotSummary } from "../draft-board";
  import type { DraftState } from "../types";
  import { getUserTeam, playerName } from "../format";

  let { state, playersOpen = false }: { state: DraftState; playersOpen?: boolean } = $props();

  const userTeam = $derived(getUserTeam(state));
  const starters = $derived(starterSlotSummary(state));
</script>

<article class="panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="users" size={17} /> {userTeam?.name ?? "Your draft roster"}</h2>
    </div>
    <span class="roster-count">{starters.filled} of {starters.total} starters</span>
  </div>
  {#if starters.groups.length > 0}
    <ul class="slot-summary" aria-label="Starter slots filled" style={`--slot-groups:${starters.groups.length}`}>
      {#each starters.groups as group (group.label)}
        <li class:open={group.filled < group.total}>
          <span>{group.label}</span>
          <b>{group.filled}/{group.total}</b>
        </li>
      {/each}
    </ul>
  {/if}
  {#if userTeam && userTeam.roster.length > 0}
    <details class="roster-players" open={playersOpen}>
      <summary>{userTeam.roster.length} of {state.settings.rounds} players drafted</summary>
      <ul class="roster-list">
        {#each userTeam.roster as playerId}
          <li>{playerName(state, playerId)}</li>
        {/each}
      </ul>
    </details>
  {:else}
    <p class="empty">No players drafted for your roster yet.</p>
  {/if}
</article>

<style>
  .panel-heading.compact h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: var(--text-lg);
  }

  .roster-count {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .slot-summary {
    display: grid;
    grid-template-columns: repeat(var(--slot-groups), minmax(0, 1fr));
    margin: 0;
    border-block: 1px solid var(--border);
    padding: 0;
    list-style: none;
  }

  .slot-summary li {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: var(--space-2) 0;
  }

  .slot-summary li + li {
    border-left: 1px solid var(--border);
  }

  .slot-summary span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .slot-summary b {
    font-size: var(--text-lg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .slot-summary .open b {
    color: var(--warning);
  }

  .roster-players {
    margin-top: var(--space-3);
  }

  .roster-players summary {
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-md);
  }

  .roster-list {
    display: grid;
    gap: 2px;
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .roster-list li {
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .roster-list li:nth-child(odd) {
    background: var(--surface-sunken);
  }

  .empty {
    margin-top: var(--space-3);
  }

  @media (max-width: 520px) {
    .slot-summary b {
      font-size: var(--text-md);
    }

    .slot-summary span {
      letter-spacing: 0;
    }
  }
</style>

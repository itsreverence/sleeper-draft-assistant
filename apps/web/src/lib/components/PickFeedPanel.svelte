<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { DraftState } from "../types";
  import { playerName, teamName } from "../format";

  let { state }: { state: DraftState } = $props();

  const recentPicks = $derived([...state.picks].reverse().slice(0, 8));
</script>

<article class="panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="activity" size={17} /> Recent picks</h2>
    </div>
  </div>
  {#if recentPicks.length > 0}
    <ul class="pick-feed">
      {#each recentPicks as pick (pick.pickNo)}
        <li>
          <span>{pick.pickNo}</span>
          <div>
            <strong>{playerName(state, pick.playerId)}</strong>
            <small>{teamName(state, pick.teamId)} - Round {pick.round}</small>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">No picks yet.</p>
  {/if}
</article>

<style>
  .pick-feed {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pick-feed li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    border-radius: var(--radius-sm);
    padding: 6px 8px;
  }

  .pick-feed li:hover {
    background: var(--surface-sunken);
  }

  .pick-feed li > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .pick-feed strong {
    display: block;
    font-size: var(--text-sm);
  }

  .pick-feed small {
    display: block;
    margin-top: 1px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>

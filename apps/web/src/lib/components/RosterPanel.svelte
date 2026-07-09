<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { DraftState } from "../types";
  import { getUserTeam, playerName } from "../format";

  let { state }: { state: DraftState } = $props();

  const userTeam = $derived(getUserTeam(state));
</script>

<article class="panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="users" size={17} /> {userTeam?.name ?? "Your draft roster"}</h2>
    </div>
  </div>
  {#if userTeam && userTeam.roster.length > 0}
    <ul class="roster-list">
      {#each userTeam.roster as playerId}
        <li>{playerName(state, playerId)}</li>
      {/each}
    </ul>
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

  .roster-list {
    display: grid;
    gap: 2px;
    margin: 0;
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
</style>

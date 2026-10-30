<script lang="ts">
  import { recentDraftPicks } from "@sleeper-draft-assistant/shared/draft-timing";
  import Icon from "./Icon.svelte";
  import PositionChip from "./PositionChip.svelte";
  import type { DraftState } from "../types";
  import { formatDraftPick, playerName, teamName } from "../format";

  let { state, limit = 8 }: { state: DraftState; limit?: number } = $props();

  const positionById = $derived(new Map(state.players.map((player) => [player.id, player.position])));
  const recentPicks = $derived(recentDraftPicks(state, limit));
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
        {@const position = positionById.get(pick.playerId)}
        <li class:mine={pick.teamId === state.userTeamId}>
          <span class="pick-no" title={`Pick ${pick.pickNo}`}>{formatDraftPick(pick.pickNo, state.settings.teams)}</span>
          {#if position}<PositionChip {position} />{:else}<span></span>{/if}
          <strong title={playerName(state, pick.playerId)}>{playerName(state, pick.playerId)}</strong>
          <small>{teamName(state, pick.teamId)}</small>
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
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pick-feed li {
    display: grid;
    grid-template-columns: 36px auto minmax(0, 1fr) minmax(0, 40%);
    gap: var(--space-2);
    align-items: center;
    min-height: 44px;
    border-top: 1px solid var(--border);
  }

  .pick-no {
    color: var(--text-muted);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
  }

  .pick-feed strong {
    overflow: hidden;
    font-size: var(--text-md);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-feed small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-feed .mine small {
    color: var(--accent);
    font-weight: 600;
  }
</style>

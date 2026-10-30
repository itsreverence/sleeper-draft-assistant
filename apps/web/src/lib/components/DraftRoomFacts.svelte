<script lang="ts">
  import { starterSlotSummary } from "../draft-board";
  import { recentPickPositions } from "../draft-room";
  import type { DraftState } from "../types";
  import Icon from "./Icon.svelte";

  let {
    state: draftState,
    watching = [],
    onOpenActivity,
  }: {
    state: DraftState;
    watching?: string[];
    onOpenActivity: () => void;
  } = $props();

  const needs = $derived(starterSlotSummary(draftState).groups);
  const recent = $derived(recentPickPositions(draftState));
</script>

{#if watching.length > 0}
  <div class="watching">
    <h2>Watching</h2>
    <ul>
      {#each watching as name (name)}<li>{name}</li>{/each}
    </ul>
  </div>
{/if}

<div class="facts">
  <ul class="needs" aria-label="Starter slots filled">
    {#each needs as group (group.label)}
      <li class:open={group.filled < group.total}>{group.label} <b>{group.filled}/{group.total}</b></li>
    {/each}
  </ul>
  <div class="activity">
    {#if recent.length > 0}<span>Last {recent.length}: {recent.join(", ")}</span>{/if}
    <button class="quiet-action" type="button" onclick={onOpenActivity}>
      Picks and roster
      <Icon name="chevron-right" size={12} />
    </button>
  </div>
</div>

<style>
  .watching {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
  }

  .watching h2 {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .watching ul,
  .needs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .watching li {
    color: var(--text-primary);
    font-size: var(--text-md);
    font-weight: 500;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1) var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .needs b {
    color: var(--text-secondary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .needs .open,
  .needs .open b {
    color: var(--warning);
  }

  .activity {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
  }

  .quiet-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 0;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .quiet-action:hover {
    color: var(--text-primary);
  }
</style>

<script lang="ts">
  import { pickStripSummary } from "../draft-board";
  import type { DraftState } from "../types";
  import Icon from "./Icon.svelte";

  let {
    state: draftState,
    strategyOpen = false,
    onOpenPlayerSearch,
    onToggleStrategy,
  }: {
    state: DraftState;
    strategyOpen?: boolean;
    onOpenPlayerSearch?: () => void;
    onToggleStrategy?: () => void;
  } = $props();

  const summary = $derived(pickStripSummary(draftState));
</script>

<section class="pick-strip" class:on-clock={summary.tone === "clock"} aria-label="Draft state">
  <span class="state">
    {#if summary.tone === "clock"}<span class="clock-dot" aria-hidden="true"></span>{/if}
    {summary.label}
  </span>
  <div class="meta">
    {#each [summary.pick, summary.nextTurn].filter((pick) => pick !== null) as pick (pick.label)}
      <span>{pick.label} <b>{pick.slot}</b> (#{pick.overall})</span>
    {/each}
    {#if summary.round}
      <span class="round">
        Round <b>{summary.round.number}</b>
        <Icon name={summary.round.direction === "forward" ? "arrow-right" : "arrow-left"} size={13} />
        {summary.round.direction === "forward" ? "left to right" : "right to left"}
      </span>
    {/if}
  </div>
  {#if onOpenPlayerSearch || onToggleStrategy}
    <div class="actions">
      {#if onOpenPlayerSearch}
        <button class="btn btn-secondary" type="button" onclick={onOpenPlayerSearch}>
          <Icon name="search" size={13} />
          Find player
        </button>
      {/if}
      {#if onToggleStrategy}
        <button class="btn btn-secondary" type="button" aria-expanded={strategyOpen} onclick={onToggleStrategy}>
          {strategyOpen ? "Close plan" : "Draft plan"}
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .pick-strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    min-height: 52px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: var(--space-2) var(--space-3);
  }

  .pick-strip.on-clock {
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-primary);
    font-weight: 700;
  }

  .on-clock .state {
    color: var(--warning);
  }

  .clock-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    min-width: 0;
    color: var(--text-secondary);
    font-size: var(--text-md);
  }

  .meta b {
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .round {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  .actions .btn {
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
  }

  @media (max-width: 760px) {
    .pick-strip {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 520px) {
    .actions .btn {
      flex: 1;
      min-height: 36px;
    }
  }
</style>

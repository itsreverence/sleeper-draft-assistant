<script lang="ts">
  import { pickStripSummary } from "../draft-board";
  import type { DraftState } from "../types";
  import Icon from "./Icon.svelte";

  let {
    state: draftState,
    updateLabel = "",
    planOpen = false,
    onOpenPlayerSearch,
    onTogglePlan,
  }: {
    state: DraftState;
    updateLabel?: string;
    planOpen?: boolean;
    onOpenPlayerSearch?: () => void;
    onTogglePlan?: () => void;
  } = $props();

  const summary = $derived(pickStripSummary(draftState));
</script>

<section class="pick-strip" class:on-clock={summary.tone === "clock"} aria-label="Draft state">
  <h2 class="state">{summary.label}</h2>
  {#if summary.facts.length > 0}
    <p class="meta">{summary.facts.map((fact) => `${fact.label} ${fact.slot}`).join(" · ")}</p>
  {/if}
  {#if updateLabel}<span class="update">{updateLabel}</span>{/if}
  {#if onOpenPlayerSearch || onTogglePlan}
    <div class="actions">
      {#if onOpenPlayerSearch}
        <button class="btn btn-secondary" type="button" onclick={onOpenPlayerSearch}>
          <Icon name="search" size={13} />
          Find player
        </button>
      {/if}
      {#if onTogglePlan}
        <button class="btn btn-secondary" type="button" aria-expanded={planOpen} onclick={onTogglePlan}>Plan</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Status sits in its own track so it can come and go without moving anything else in the room. */
  .pick-strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: "state meta update actions";
    align-items: center;
    gap: var(--space-1) var(--space-4);
    min-height: 56px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
  }

  .pick-strip.on-clock {
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .state {
    grid-area: state;
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .on-clock .state {
    color: var(--warning);
  }

  .meta {
    grid-area: meta;
    min-width: 0;
    color: var(--text-secondary);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
  }

  .update {
    grid-area: update;
    color: var(--text-muted);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .on-clock .update {
    color: var(--text-secondary);
  }

  .actions {
    grid-area: actions;
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
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "state update"
        "meta meta"
        "actions actions";
      padding-left: var(--space-3);
    }
  }

  @media (max-width: 520px) {
    .actions .btn {
      flex: 1;
      min-height: 36px;
    }
  }
</style>

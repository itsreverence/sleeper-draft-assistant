<script lang="ts" module>
  let nextId = 0;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    name,
    title,
    summary,
    warn = false,
    open = $bindable(false),
    children,
  }: {
    name: string;
    title: string;
    summary: string;
    warn?: boolean;
    open?: boolean;
    children: Snippet;
  } = $props();

  const id = `data-line-${++nextId}`;
</script>

<section class="line" data-line={name} aria-labelledby={`${id}-title`}>
  <h3>
    <button class="line-head" type="button" aria-expanded={open} aria-controls={`${id}-body`} onclick={() => (open = !open)}>
      <span class="line-text">
        <span class="line-title" id={`${id}-title`}>{title}</span>
        <span class="line-summary" class:warn>{summary}</span>
      </span>
      <span class="chevron" class:open><Icon name="chevron-right" size={16} /></span>
    </button>
  </h3>
  <!-- Stays mounted while closed so typed values and chosen files survive; hidden keeps its controls out of the tab order. -->
  <div class="line-body" id={`${id}-body`} hidden={!open}>
    {@render children()}
  </div>
</section>

<style>
  .line {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .line-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
    text-align: left;
  }

  .line-head:hover {
    background: var(--surface-hover);
  }

  .line-head:focus-visible {
    outline-offset: -2px;
    border-radius: var(--radius-md);
  }

  .line-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .line-title {
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: 600;
  }

  .line-summary {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .line-summary.warn {
    color: var(--warning);
  }

  .chevron {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform var(--transition-fast);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .line-body {
    display: grid;
    gap: var(--space-3);
    border-top: 1px solid var(--border);
    padding: var(--space-4);
  }

  .line-body[hidden] {
    display: none;
  }
</style>

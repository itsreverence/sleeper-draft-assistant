<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { ReadinessItem } from "../types";

  let {
    items,
  }: {
    items: ReadinessItem[];
  } = $props();
</script>

<div class="setup-strip" aria-label="Setup progress">
  <span class="strip-label">Setup</span>
  <div class="strip-steps">
    {#each items as item, index (item.label)}
      <div class="step-chip tone-{item.tone}" title={`${item.label}: ${item.value} - ${item.detail}`}>
        <span class="step-marker">
          {#if item.tone === "ready"}
            <Icon name="check-circle" size={12} />
          {:else}
            {index + 1}
          {/if}
        </span>
        <span class="step-label">{item.label}</span>
        <span class="step-value">{item.value}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .setup-strip {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .strip-label {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .strip-steps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .step-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    padding: 4px 10px 4px 6px;
    font-size: var(--text-xs);
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .step-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
  }

  .step-label {
    color: var(--text-muted);
    font-weight: 700;
  }

  .step-value {
    color: var(--text-secondary);
    font-weight: 700;
  }

  .step-chip.tone-ready {
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }

  .step-chip.tone-ready .step-marker {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .step-chip.tone-ready .step-value {
    color: var(--text-primary);
  }

  .step-chip.tone-warning {
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .step-chip.tone-warning .step-marker {
    color: var(--warning);
  }

  .step-chip.tone-blocked {
    border-color: var(--danger-border);
    background: var(--danger-soft);
  }

  .step-chip.tone-blocked .step-marker {
    color: var(--danger);
  }

  @media (max-width: 720px) {
    .setup-strip {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .step-label {
      display: none;
    }
  }
</style>

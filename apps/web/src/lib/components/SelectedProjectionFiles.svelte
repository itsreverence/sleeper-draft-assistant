<script lang="ts">
  import { positionLabel } from "../team-attention";
  import type { WeeklyFileSelection } from "../weekly-file-selection.svelte";

  let { selection }: { selection: WeeklyFileSelection } = $props();
</script>

{#if selection.files.length > 0}
  <div class="selected-files">
    {#each selection.files as file}
      <span><strong>{positionLabel(file.position)}</strong>{file.name}</span>
    {/each}
  </div>
{/if}
{#if selection.ignored.length > 0}
  <p class="note">Ignored {selection.ignored.join(", ")}. FLEX is redundant when RB, WR, and TE files are included.</p>
{/if}
{#if selection.unknown.length > 0}
  <p class="note">Could not identify a position for {selection.unknown.join(", ")}. Import each file separately with its position selected, or keep the original FantasyPros filenames.</p>
{/if}

<style>
  .selected-files {
    display: grid;
    gap: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-2);
  }

  .selected-files span {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: var(--space-2);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }

  .selected-files strong {
    color: var(--accent);
  }

  .note {
    overflow-wrap: anywhere;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.4;
  }
</style>

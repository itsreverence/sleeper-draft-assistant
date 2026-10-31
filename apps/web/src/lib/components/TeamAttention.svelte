<script lang="ts">
  import { attentionHeading, type AttentionItem, type LineupCheck, type TeamDataSection } from "../team-attention";

  let {
    check,
    onManageData,
  }: {
    check: LineupCheck;
    onManageData?: (section: TeamDataSection) => void;
  } = $props();

  function follow(item: AttentionItem) {
    if (item.kind === "starter") document.getElementById(item.rowId)?.focus();
    else onManageData?.(item.section);
  }
</script>

{#if check.state === "needs-look"}
  <section class="attention needs-look" aria-labelledby="team-attention-heading">
    <h2 id="team-attention-heading">{attentionHeading(check.items.length)}</h2>
    <ul aria-labelledby="team-attention-heading">
      {#each check.items as item (item.id)}
        <li>
          <button type="button" aria-haspopup={item.kind === "data" ? "dialog" : undefined} onclick={() => follow(item)}>{item.label}</button>
        </li>
      {/each}
    </ul>
  </section>
{:else if check.state === "clear"}
  <section class="attention clear">
    <span class="dot" aria-hidden="true"></span>
    <h2>Lineup looks set</h2>
    <p>{check.detail}</p>
  </section>
{:else}
  <p class="attention note">{check.text}</p>
{/if}

<style>
  .attention { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); padding: var(--space-3) var(--space-4); }

  .needs-look { display: grid; gap: var(--space-1); border-color: var(--warning-border); background: var(--warning-soft); }
  .needs-look h2 { color: var(--warning); font-size: var(--text-lg); }
  ul { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin: 0; padding: 0; list-style: none; }
  li { min-width: 0; }
  li button { min-height: 28px; border: 0; border-radius: var(--radius-sm); background: transparent; padding: 0; color: var(--text-primary); cursor: pointer; font-size: var(--text-md); overflow-wrap: anywhere; text-align: left; text-decoration: underline; text-decoration-color: var(--warning-border); text-underline-offset: 3px; }
  li button:hover { text-decoration-color: var(--warning); }

  .clear { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); }
  .dot { align-self: center; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .clear h2 { font-size: var(--text-base); font-weight: 600; }
  .clear p { color: var(--text-muted); font-size: var(--text-md); }

  .note { color: var(--text-secondary); font-size: var(--text-md); }
</style>

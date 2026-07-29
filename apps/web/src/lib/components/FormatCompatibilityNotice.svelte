<script lang="ts">
  import type { FormatCompatibility } from "../types";
  import Icon from "./Icon.svelte";

  let { compatibility }: { compatibility: FormatCompatibility | null | undefined } = $props();
</script>

{#if compatibility && compatibility.level !== "supported" && compatibility.warnings.length > 0}
  <aside class="format-notice" class:unsupported={compatibility.level === "unsupported"} aria-label="League format compatibility">
    <Icon name="alert" size={16} />
    <div>
      <strong>{compatibility.level === "unsupported" ? "Some league settings are unsupported" : "Review league format limitations"}</strong>
      <p>{compatibility.warnings.join(" ")}</p>
    </div>
  </aside>
{/if}

<style>
  .format-notice {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 9px;
    align-items: start;
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    color: var(--warning);
    background: var(--warning-soft);
  }
  .format-notice.unsupported {
    border-color: var(--danger-border);
    color: var(--danger);
    background: var(--danger-soft);
  }
  strong,
  p {
    display: block;
    margin: 0;
  }
  strong {
    font-size: var(--text-sm);
  }
  p {
    margin-top: 2px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.45;
  }
</style>

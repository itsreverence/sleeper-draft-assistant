<script lang="ts">
  import type { Position } from "../types";

  let { position, label = position, size = "sm" }: { position: Position; label?: string; size?: "sm" | "lg" } = $props();
</script>

<span class={`pos-chip position-${position.toLowerCase()} ${size}`}>{label}</span>

<style>
  .pos-chip {
    display: inline-grid;
    flex-shrink: 0;
    place-items: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--position-color) 18%, transparent);
    color: var(--position-color);
    font-weight: 600;
  }

  .sm {
    width: 34px;
    height: 24px;
    font-size: var(--text-xs);
  }

  .lg {
    width: 40px;
    height: 40px;
    font-size: var(--text-md);
  }

  .position-qb { --position-color: var(--pos-qb); }
  .position-rb { --position-color: var(--pos-rb); }
  .position-wr { --position-color: var(--pos-wr); }
  .position-te { --position-color: var(--pos-te); }
  .position-k { --position-color: var(--pos-k); }
  .position-def { --position-color: var(--pos-def); }
</style>

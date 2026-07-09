<script lang="ts">
  import type { TeamNeedsSummary } from "../types";

  let { needs }: { needs: TeamNeedsSummary | null } = $props();

  function formatPositions(positions: string[]) {
    return positions.length > 0 ? positions.join(" / ") : "—";
  }
</script>

{#if needs}
  <section class="needs-strip" aria-label="Roster needs">
    <div class="headline">
      <span>Needs</span>
      <strong>{needs.headline}</strong>
    </div>
    <div class="stats">
      <div>
        <span>Weakest</span>
        <strong>{formatPositions(needs.weakestPositions)}</strong>
      </div>
      <div>
        <span>Open</span>
        <strong>{needs.openStarterSlots.length}</strong>
      </div>
      <div>
        <span>Thin</span>
        <strong>{formatPositions(needs.thinPositions)}</strong>
      </div>
    </div>
  </section>
{/if}

<style>
  .needs-strip {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-4);
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .headline span,
  .stats span {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .headline strong,
  .stats strong {
    display: block;
    margin-top: 2px;
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--text-primary);
  }

  .headline strong {
    font-size: var(--text-base);
    line-height: 1.35;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 720px) {
    .needs-strip {
      grid-template-columns: 1fr;
    }
  }
</style>

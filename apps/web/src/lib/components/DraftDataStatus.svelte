<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    hasRankings,
    rankingsStale = false,
    hasProjections,
    hasAdp,
    limitedMode = false,
    onOpen,
  }: {
    hasRankings: boolean;
    rankingsStale?: boolean;
    hasProjections: boolean;
    hasAdp: boolean;
    limitedMode?: boolean;
    onOpen: () => void;
  } = $props();

  const loadedCount = $derived(
    Number(hasRankings) + Number(hasProjections) + Number(hasAdp),
  );
</script>

<button class="panel data-status" class:warning={!hasRankings || rankingsStale} type="button" onclick={onOpen}>
  <Icon name={hasRankings && !rankingsStale ? "check-circle" : "alert"} size={17} />
  <span>
    <strong>Draft data</strong>
    <small>
      {rankingsStale
        ? "ECR needs refresh"
        : limitedMode && !hasRankings
        ? "Limited mode"
        : loadedCount === 3
          ? "3/3 sources ready"
          : `${loadedCount}/3 sources ready`}
    </small>
  </span>
  <Icon name="chevron-right" size={14} />
</button>

<style>
  .data-status {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 13px 14px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .data-status:hover {
    border-color: var(--border-strong);
    background: var(--surface-raised);
  }

  .data-status > :global(.icon:first-child) {
    color: var(--accent);
  }

  .data-status.warning > :global(.icon:first-child) {
    color: var(--warning);
  }

  .data-status > :global(.icon:last-child) {
    color: var(--text-muted);
  }

  .data-status span {
    display: grid;
    gap: 2px;
  }

  .data-status strong {
    font-size: var(--text-sm);
  }

  .data-status small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>

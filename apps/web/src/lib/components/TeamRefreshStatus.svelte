<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    lastCheckedAt = null,
    lastChangedAt = null,
    isRefreshing = false,
    error = "",
    onRefresh,
  }: {
    lastCheckedAt?: number | null;
    lastChangedAt?: number | null;
    isRefreshing?: boolean;
    error?: string;
    onRefresh?: () => void | Promise<void>;
  } = $props();

  const statusText = $derived.by(() => {
    if (isRefreshing) {
      return "Checking Sleeper...";
    }
    if (error) {
      return lastCheckedAt
        ? `Refresh failed. Showing data checked ${formatTime(lastCheckedAt)}.`
        : "Refresh failed. Try again.";
    }
    if (lastCheckedAt === null) {
      return "Waiting for Sleeper team data";
    }
    if (lastChangedAt === lastCheckedAt) {
      return `Team data updated ${formatTime(lastCheckedAt)}`;
    }
    return `Sleeper checked ${formatTime(lastCheckedAt)}; no changes`;
  });

  function formatTime(value: number): string {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
</script>

<div class="refresh-status" class:error={Boolean(error)} aria-live="polite">
  <span class="status-dot" aria-hidden="true"></span>
  <span>{statusText}</span>
  <button
    class="refresh-button"
    type="button"
    aria-label="Refresh team data"
    title="Refresh team data"
    disabled={isRefreshing}
    onclick={() => void onRefresh?.()}
  >
    <Icon name="refresh" size={15} />
  </button>
</div>

<style>
  .refresh-status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    margin: var(--space-3) 0;
    padding: 6px 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--accent);
  }

  .refresh-status.error {
    color: var(--warning);
  }

  .refresh-status.error .status-dot {
    background: var(--warning);
  }

  .refresh-button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-left: auto;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .refresh-button:hover:not(:disabled) {
    border-color: var(--border);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .refresh-button:disabled {
    cursor: wait;
    opacity: 0.5;
  }
</style>

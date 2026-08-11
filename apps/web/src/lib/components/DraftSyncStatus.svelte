<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    lastSuccessfulAt = null,
    consecutiveFailures = 0,
    nextRetryMs = 0,
    reconnecting = false,
    onReconnect,
  }: {
    lastSuccessfulAt?: number | null;
    consecutiveFailures?: number;
    nextRetryMs?: number;
    reconnecting?: boolean;
    onReconnect?: () => void;
  } = $props();

  const degraded = $derived(consecutiveFailures > 0 || reconnecting);
  const displayLabel = $derived.by(() => {
    if (consecutiveFailures > 0) return "Stale";
    if (reconnecting) return "Syncing";
    return lastSuccessfulAt ? "Synced" : "Waiting";
  });
  const displayDetail = $derived.by(() => {
    if (consecutiveFailures > 0) return lastSuccessfulAt ? formatTime(lastSuccessfulAt) : "No successful sync";
    if (reconnecting) return lastSuccessfulAt ? `Last ${formatTime(lastSuccessfulAt)}` : "Connecting";
    return lastSuccessfulAt ? formatTime(lastSuccessfulAt) : "Not connected";
  });
  const statusText = $derived.by(() => {
    if (consecutiveFailures > 0) {
      const checked = lastSuccessfulAt ? ` Last synced ${formatTime(lastSuccessfulAt)}.` : "";
      const retry = nextRetryMs > 0 ? ` Retrying in ${Math.ceil(nextRetryMs / 1000)}s.` : "";
      return `Sleeper refresh failed ${consecutiveFailures} time${consecutiveFailures === 1 ? "" : "s"}. Showing the last synced draft.${checked}${retry}`;
    }
    if (reconnecting) {
      return lastSuccessfulAt
        ? `Reconnecting to Sleeper. Showing data synced ${formatTime(lastSuccessfulAt)}.`
        : "Connecting to Sleeper...";
    }
    return lastSuccessfulAt ? `Sleeper synced ${formatTime(lastSuccessfulAt)}` : "Waiting for Sleeper sync";
  });

  function formatTime(value: number): string {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }
</script>

<div class="sync-status" class:degraded title={statusText} aria-label={statusText} aria-live="polite">
  <span class="status-dot" aria-hidden="true"></span>
  <span class="sync-label">{displayLabel}</span>
  <span class="sync-detail">{displayDetail}</span>
  {#if degraded}
    <button class="refresh-button" type="button" aria-label="Reconnect draft sync" title="Reconnect draft sync" onclick={onReconnect}>
      <Icon name="refresh" size={15} />
    </button>
  {/if}
</div>

<style>
  .sync-status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 4px 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .sync-label {
    color: var(--accent);
    font-size: var(--text-2xs);
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sync-detail {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 600;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent);
  }
  .sync-status.degraded {
    gap: 7px;
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
    padding: 4px 8px;
    color: var(--warning);
  }
  .sync-status.degraded .sync-label {
    color: var(--warning);
  }
  .sync-status.degraded .sync-detail {
    color: var(--warning);
  }
  .sync-status.degraded .status-dot {
    background: var(--warning);
  }
  .refresh-button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-left: 1px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .refresh-button:hover {
    border-color: var(--border);
    background: var(--surface-raised);
  }
</style>

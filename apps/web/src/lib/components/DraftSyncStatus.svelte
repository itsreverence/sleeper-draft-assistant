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

<div class="sync-status" class:degraded aria-live="polite">
  <span class="status-dot" aria-hidden="true"></span>
  <span>{statusText}</span>
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
    min-height: 32px;
    padding: 4px 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent);
  }
  .sync-status.degraded {
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
    margin-left: auto;
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

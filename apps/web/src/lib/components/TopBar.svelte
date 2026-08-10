<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    title,
    status,
    lastEvent,
    connected,
    showStatus = true,
    showChangeDraft = false,
    centered = false,
    settingsOpen = false,
    draftSwitcherOpen = false,
    onOpenDraftSwitcher,
    onOpenSettings,
  }: {
    title: string;
    status: string;
    lastEvent: string;
    connected: boolean;
    showStatus?: boolean;
    showChangeDraft?: boolean;
    centered?: boolean;
    settingsOpen?: boolean;
    draftSwitcherOpen?: boolean;
    onOpenDraftSwitcher?: () => void;
    onOpenSettings?: () => void;
  } = $props();
</script>

<section class="topbar" class:centered class:has-draft={showChangeDraft} aria-label="Draft status">
  <div class="brand">
    {#if !connected}
      <img class="brand-mark" src="./favicon.svg" alt="" aria-hidden="true" />
    {/if}
    <div>
      <div class="title-row">
        {#if showChangeDraft}
          <h1>
            <button
              class="draft-switch-trigger"
              type="button"
              title="Switch league or draft"
              aria-haspopup="dialog"
              aria-expanded={draftSwitcherOpen}
              onclick={onOpenDraftSwitcher}
            >
              <span>{title}</span>
              <Icon name="switch" size={16} />
            </button>
          </h1>
        {:else}
          <h1>{title}</h1>
        {/if}
      </div>
      {#if !showChangeDraft}
        <p class="product-name">Sleeper Draft Assistant</p>
      {/if}
    </div>
  </div>
  <div class="topbar-actions">
    {#if showStatus}
      <div class="status-panel" class:connected>
        <span class="status-dot" aria-hidden="true"></span>
        <div>
          <strong>{status}</strong>
          <span>{lastEvent}</span>
        </div>
      </div>
    {/if}
    <button
      class="settings-button"
      class:active={settingsOpen}
      type="button"
      aria-label={settingsOpen ? "Close settings" : "Open settings"}
      aria-pressed={settingsOpen}
      title={settingsOpen ? "Close settings" : "Open settings"}
      onclick={onOpenSettings}
    >
      <Icon name="settings" size={18} />
    </button>
  </div>
</section>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: var(--space-2) 0 var(--space-6);
  }

  .topbar.centered {
    position: relative;
    justify-content: center;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    min-width: 0;
  }

  .brand-mark {
    display: block;
    width: 42px;
    height: 42px;
    flex-shrink: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.15;
  }

  .product-name {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .draft-switch-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .draft-switch-trigger > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .draft-switch-trigger > :global(.icon) {
    transform: translateY(2px);
  }

  .draft-switch-trigger:hover,
  .draft-switch-trigger[aria-expanded="true"] {
    color: var(--accent);
  }

  .draft-switch-trigger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  .settings-button {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .settings-button:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
  }

  .settings-button.active {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .settings-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .topbar.centered .settings-button {
    position: fixed;
    z-index: 20;
    top: var(--space-6);
    right: var(--space-6);
  }

  .topbar.centered .topbar-actions {
    display: contents;
  }

  .status-panel {
    display: flex;
    align-items: center;
    min-width: 260px;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    padding: 11px 16px;
  }

  .brand > div {
    min-width: 0;
  }

  .status-panel strong,
  .status-panel span {
    display: block;
  }

  .status-panel strong {
    font-size: var(--text-sm);
  }

  .status-panel span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    margin-top: 2px;
  }

  .status-dot {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--text-muted);
  }

  .status-panel.connected .status-dot {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
    animation: pulse 2.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 4px var(--accent-soft);
    }
    50% {
      box-shadow: 0 0 0 7px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-panel.connected .status-dot {
      animation: none;
    }
  }

  @media (max-width: 720px) {
    .topbar {
      align-items: stretch;
      flex-direction: column;
    }

    .topbar.centered {
      align-items: flex-start;
      flex-direction: row;
      justify-content: flex-start;
      padding-right: 46px;
    }

    .topbar.has-draft {
      align-items: flex-start;
      flex-direction: row;
    }

    .topbar.has-draft .brand {
      flex: 1;
    }

    .topbar-actions {
      align-self: flex-start;
    }

    .status-panel {
      min-width: 0;
    }

    .title-row {
      min-width: 0;
    }

    .topbar.has-draft h1 {
      overflow-wrap: anywhere;
    }

    .draft-switch-trigger span {
      white-space: normal;
      overflow-wrap: anywhere;
    }

  }
</style>

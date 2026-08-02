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
    draftOptions = [],
    activeDraftId = "",
    onSelectDraft,
    onFindAnotherLeague,
    onOpenDraftId,
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
    draftOptions?: Array<{ draftId: string; name: string; detail: string }>;
    activeDraftId?: string;
    onSelectDraft?: (draftId: string) => void | Promise<void>;
    onFindAnotherLeague?: () => void;
    onOpenDraftId?: (draftId: string) => void | Promise<void>;
    onOpenSettings?: () => void;
  } = $props();

  let switcherOpen = $state(false);
  let draftIdEntryOpen = $state(false);
  let draftIdInput = $state("");
  let switcherElement: HTMLDetailsElement | undefined = $state();

  function closeSwitcher() {
    switcherOpen = false;
    draftIdEntryOpen = false;
    draftIdInput = "";
  }

  async function selectDraft(draftId: string) {
    if (draftId === activeDraftId) return;
    await onSelectDraft?.(draftId);
    closeSwitcher();
  }

  async function submitDraftId(event: SubmitEvent) {
    event.preventDefault();
    const draftId = draftIdInput.trim();
    if (!draftId) return;
    await onOpenDraftId?.(draftId);
    closeSwitcher();
  }

  function handleDocumentPointer(event: PointerEvent) {
    if (switcherOpen && event.target instanceof Node && !switcherElement?.contains(event.target)) {
      closeSwitcher();
    }
  }

  $effect(() => {
    if (!switcherOpen) return;
    document.addEventListener("pointerdown", handleDocumentPointer);
    return () => document.removeEventListener("pointerdown", handleDocumentPointer);
  });
</script>

<section class="topbar" class:centered class:has-draft={showChangeDraft} aria-label="Draft status">
  <div class="brand">
    <div class="brand-mark" aria-hidden="true">SDA</div>
    <div>
      <div class="title-row">
        {#if showChangeDraft}
          <details class="league-switcher-menu" bind:this={switcherElement} bind:open={switcherOpen}>
            <summary class="league-switcher" title="Change draft">
              <h1>{title}</h1>
              <Icon name="chevron-right" size={17} />
            </summary>
            <div class="switcher-popover">
              <strong class="switcher-title">Switch draft</strong>
              <div class="switcher-options">
                {#each draftOptions as option (option.draftId)}
                  <button
                    class:current={option.draftId === activeDraftId}
                    type="button"
                    disabled={option.draftId === activeDraftId}
                    onclick={() => selectDraft(option.draftId)}
                  >
                    <span class="option-marker">
                      {#if option.draftId === activeDraftId}<Icon name="check-circle" size={15} />{/if}
                    </span>
                    <span>
                      <strong>{option.name}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                {/each}
              </div>
              <div class="switcher-actions">
                <button
                  type="button"
                  onclick={() => {
                    closeSwitcher();
                    onFindAnotherLeague?.();
                  }}
                >Find another league</button>
                <button type="button" onclick={() => (draftIdEntryOpen = !draftIdEntryOpen)}>Open by draft ID</button>
              </div>
              {#if draftIdEntryOpen}
                <form class="draft-id-form" onsubmit={submitDraftId}>
                  <label for="switcher-draft-id">Sleeper draft ID</label>
                  <div>
                    <input id="switcher-draft-id" bind:value={draftIdInput} type="text" placeholder="Paste a draft ID" />
                    <button type="submit" disabled={!draftIdInput.trim()}>Open</button>
                  </div>
                </form>
              {/if}
            </div>
          </details>
        {:else}
          <h1>{title}</h1>
        {/if}
      </div>
      <p class="product-name">Sleeper Draft Assistant</p>
    </div>
  </div>
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

  .brand-mark {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.02em;
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

  .league-switcher {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 3px 5px 3px 0;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    list-style: none;
  }

  .league-switcher::-webkit-details-marker {
    display: none;
  }

  .league-switcher:hover {
    color: var(--accent);
  }

  .league-switcher:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .league-switcher :global(.icon) {
    flex-shrink: 0;
    transform: rotate(90deg);
    transition: transform var(--transition-fast);
  }

  .league-switcher-menu[open] .league-switcher :global(.icon) {
    transform: rotate(-90deg);
  }

  .league-switcher-menu {
    position: relative;
    min-width: 0;
  }

  .switcher-popover {
    position: absolute;
    z-index: 30;
    top: calc(100% + 26px);
    left: 0;
    display: grid;
    gap: 10px;
    width: min(360px, calc(100vw - 48px));
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
    padding: 12px;
  }

  .switcher-title {
    font-size: var(--text-sm);
  }

  .switcher-options {
    display: grid;
  }

  .switcher-options > button {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 9px 8px;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .switcher-options > button:hover:not(:disabled) {
    background: var(--surface-sunken);
  }

  .switcher-options > button.current {
    background: var(--accent-soft);
  }

  .switcher-options > button:disabled {
    cursor: default;
  }

  .switcher-options strong,
  .switcher-options small {
    display: block;
  }

  .switcher-options strong {
    font-size: var(--text-sm);
  }

  .switcher-options small {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .option-marker {
    color: var(--accent);
  }

  .switcher-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .switcher-actions button {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .switcher-actions button:hover {
    color: var(--text-primary);
  }

  .draft-id-form {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .draft-id-form label {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .draft-id-form > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .draft-id-form input,
  .draft-id-form button {
    min-width: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    padding: 8px 9px;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
  }

  .draft-id-form button {
    background: var(--surface-raised);
    cursor: pointer;
    font-weight: 700;
  }

  .draft-id-form button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .settings-button {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .settings-button:hover,
  .settings-button.active {
    border-color: var(--border);
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

    .status-panel {
      min-width: 0;
    }

    .title-row {
      min-width: 0;
    }

    .league-switcher {
      align-items: flex-start;
    }

    .league-switcher h1 {
      overflow-wrap: anywhere;
    }

    .switcher-popover {
      left: calc(-42px - var(--space-3));
    }
  }
</style>

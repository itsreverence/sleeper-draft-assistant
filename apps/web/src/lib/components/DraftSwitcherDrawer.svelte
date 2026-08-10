<script lang="ts">
  import type { ConnectDraft, ConnectLeague, ConnectPayload } from "../types";
  import Icon from "./Icon.svelte";
  import ConnectPanel from "./ConnectPanel.svelte";

  let {
    draftOptions = [],
    activeDraftId,
    usernameInput = $bindable(""),
    seasonInput = $bindable(""),
    leagueInput = $bindable(""),
    draftInput = $bindable(""),
    userRosterIdInput = $bindable(""),
    connectPayload,
    selectedLeagueId,
    selectedDraftId,
    isConnecting,
    isLoading,
    loadError,
    activeSourceLabel,
    activeUserRosterId,
    onFindLeagues,
    onResetLookup,
    onSelectLeague,
    onSelectDraft,
    onSelectKnownDraft,
    onOpenSelectedDraft: openSelectedDraftCallback,
    onConnectSleeperDraft: connectSleeperDraftCallback,
    onViewDraftResults,
    onClose,
  }: {
    draftOptions: Array<{ draftId: string; name: string; detail: string }>;
    activeDraftId: string;
    usernameInput?: string;
    seasonInput?: string;
    leagueInput?: string;
    draftInput?: string;
    userRosterIdInput?: string;
    connectPayload: ConnectPayload | null;
    selectedLeagueId: string;
    selectedDraftId: string;
    isConnecting: boolean;
    isLoading: boolean;
    loadError: string;
    activeSourceLabel: string;
    activeUserRosterId: string | null;
    onFindLeagues: () => void;
    onResetLookup: () => void;
    onSelectLeague: (league: ConnectLeague) => void;
    onSelectDraft: (draft: ConnectDraft) => void;
    onSelectKnownDraft: (draftId: string) => void | Promise<boolean>;
    onOpenSelectedDraft: () => void | Promise<boolean>;
    onConnectSleeperDraft: () => void | Promise<boolean>;
    onViewDraftResults?: () => void;
    onClose: () => void;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  async function selectKnownDraft(draftId: string) {
    const opened = await onSelectKnownDraft(draftId);
    if (opened !== false) onClose();
  }

  async function openSelectedDraft() {
    const opened = await openSelectedDraftCallback();
    if (opened !== false) onClose();
  }

  async function connectSleeperDraft() {
    const opened = await connectSleeperDraftCallback();
    if (opened !== false) onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="drawer-backdrop" type="button" aria-label="Close draft switcher" onclick={onClose}></button>
<div class="switcher-drawer" role="dialog" aria-modal="true" aria-label="Switch league or draft">
  <button class="drawer-close" type="button" aria-label="Close draft switcher" onclick={onClose}>
    <Icon name="close" size={16} />
  </button>

  <header class="drawer-header">
    <p class="eyebrow">Workspace</p>
    <h2>Switch league or draft</h2>
    <p>Keep this draft open while you find another Sleeper workspace.</p>
  </header>

  {#if draftOptions.length > 0}
    <section class="known-drafts" aria-labelledby="known-drafts-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow" id="known-drafts-heading">Known drafts</p>
          <p>Select a loaded draft to open it immediately.</p>
        </div>
        {#if onViewDraftResults}
          <button class="text-link" type="button" onclick={onViewDraftResults}>View results</button>
        {/if}
      </div>
      <div class="known-list">
        {#each draftOptions as option (option.draftId)}
          <button
            class="known-draft"
            class:current={option.draftId === activeDraftId}
            type="button"
            disabled={option.draftId === activeDraftId}
            onclick={() => selectKnownDraft(option.draftId)}
          >
            <span class="draft-marker" aria-hidden="true">
              {#if option.draftId === activeDraftId}<Icon name="check-circle" size={16} />{:else}<Icon name="chevron-right" size={16} />{/if}
            </span>
            <span class="draft-copy">
              <strong>{option.name}</strong>
              <small>{option.detail}</small>
            </span>
            <span class="draft-state">{option.draftId === activeDraftId ? "Current" : "Open"}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="find-section" aria-label="Find another Sleeper draft">
    <ConnectPanel
      bind:usernameInput
      bind:seasonInput
      bind:leagueInput
      bind:draftInput
      bind:userRosterIdInput
      {connectPayload}
      {selectedLeagueId}
      {selectedDraftId}
      {isConnecting}
      {isLoading}
      {loadError}
      {activeSourceLabel}
      activeDraftId=""
      {activeUserRosterId}
      {onFindLeagues}
      {onResetLookup}
      {onSelectLeague}
      {onSelectDraft}
      onOpenSelectedDraft={openSelectedDraft}
      onConnectSleeperDraft={connectSleeperDraft}
      onLoadMockDraft={() => undefined}
      showDemo={false}
    />
  </section>
</div>

<style>
  .drawer-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 0.52);
    cursor: default;
  }

  .switcher-drawer {
    position: fixed;
    z-index: 41;
    top: 0;
    right: 0;
    display: grid;
    align-content: start;
    gap: var(--space-5);
    width: min(560px, 94vw);
    height: 100vh;
    overflow-y: auto;
    border-left: 1px solid var(--border-strong);
    background: var(--surface-raised);
    box-shadow: -18px 0 50px rgb(0 0 0 / 0.28);
    padding: 52px var(--space-5) var(--space-6);
  }

  .drawer-close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .drawer-close:hover {
    border-color: var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .drawer-header,
  .section-heading {
    display: grid;
    gap: 6px;
  }

  .drawer-header h2 {
    font-size: var(--text-xl);
  }

  .drawer-header > p:last-child,
  .section-heading p:last-child {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .known-drafts,
  .find-section {
    display: grid;
    gap: var(--space-3);
  }

  .section-heading {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-3);
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3);
  }

  .section-heading .text-link {
    align-self: center;
  }

  .known-list {
    display: grid;
    gap: 6px;
  }

  .known-draft {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: 11px 12px;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .known-draft:hover:not(:disabled) {
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }

  .known-draft.current {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    cursor: default;
  }

  .known-draft:disabled {
    opacity: 1;
  }

  .draft-marker {
    display: grid;
    place-items: center;
    color: var(--accent);
  }

  .draft-copy,
  .draft-copy strong,
  .draft-copy small {
    display: block;
    min-width: 0;
  }

  .draft-copy strong {
    overflow: hidden;
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .draft-copy small {
    margin-top: 3px;
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .draft-state {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .known-draft.current .draft-state {
    color: var(--accent);
  }

  .find-section :global(.connect-panel) {
    gap: var(--space-4);
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
  }

  .find-section :global(.connect-panel > .section-header h2) {
    font-size: var(--text-lg);
  }

  @media (max-width: 720px) {
    .switcher-drawer {
      top: auto;
      bottom: 0;
      width: 100%;
      height: min(88vh, 760px);
      border-top: 1px solid var(--border-strong);
      border-left: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      padding-inline: var(--space-4);
    }
  }
</style>

<script lang="ts">
  import type { ConnectDraft, ConnectLeague, ConnectPayload } from "../types";
  import Drawer from "./Drawer.svelte";
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

<Drawer
  label="Switch league or draft"
  closeLabel="Close draft switcher"
  eyebrow="Workspace"
  title="Switch league or draft"
  subtitle="Keep this draft open while you find another Sleeper workspace."
  {onClose}
>
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
</Drawer>

<style>
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
    display: grid;
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
    font-weight: 600;
  }

  .known-draft.current .draft-state {
    color: var(--accent);
  }

  .find-section :global(.connect-panel) {
    width: 100%;
    max-width: none;
    margin: 0;
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

  .find-section :global(.mini-links) {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
</style>

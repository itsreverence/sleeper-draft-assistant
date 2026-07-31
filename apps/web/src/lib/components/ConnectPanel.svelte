<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { ConnectDraft, ConnectLeague, ConnectPayload } from "../types";

  let {
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
    activeDraftId,
    activeUserRosterId,
    onFindLeagues,
    onResetLookup,
    onSelectLeague,
    onSelectDraft,
    onOpenSelectedDraft,
    onConnectSleeperDraft,
    onLoadMockDraft,
  }: {
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
    activeDraftId: string;
    activeUserRosterId: string | null;
    onFindLeagues: () => void;
    onResetLookup: () => void;
    onSelectLeague: (league: ConnectLeague) => void;
    onSelectDraft: (draft: ConnectDraft) => void;
    onOpenSelectedDraft: () => void;
    onConnectSleeperDraft: () => void;
    onLoadMockDraft: () => void;
  } = $props();

  let leaguePanelOpen = $state(false);
  let draftPanelOpen = $state(false);

  const selectedLeague = $derived(connectPayload?.leagues.find((league) => league.leagueId === selectedLeagueId) ?? null);
  const selectedDraft = $derived(selectedLeague?.drafts.find((draft) => draft.draftId === selectedDraftId) ?? null);
  const hasMultipleLeagues = $derived((connectPayload?.leagues.length ?? 0) > 1);
  const hasMultipleDrafts = $derived((selectedLeague?.drafts.length ?? 0) > 1);
  const showLeaguePicker = $derived(hasMultipleLeagues);
  const showDraftPicker = $derived(Boolean(selectedLeague && hasMultipleDrafts));
  const showReadyCard = $derived(Boolean(selectedLeague && selectedDraft));
  const noLeaguesFound = $derived(Boolean(connectPayload && connectPayload.leagues.length === 0));

  $effect(() => {
    if (noLeaguesFound) leaguePanelOpen = true;
  });

  function confirmSummary(league: ConnectLeague, draft: ConnectDraft) {
    const match = league.userRosterId
      ? `matched to your roster ${league.userRosterId}`
      : draft.userDraftSlot
        ? `matched to draft slot ${draft.userDraftSlot}`
        : "team match checked after opening";
    return `${draft.type} - ${draft.rounds ?? "?"} rounds - ${match}`;
  }

  function submitLookup(event: SubmitEvent) {
    event.preventDefault();
    onFindLeagues();
  }

  function submitLeagueLookup(event: SubmitEvent) {
    event.preventDefault();
    onFindLeagues();
  }

  function submitAdvanced(event: SubmitEvent) {
    event.preventDefault();
    onConnectSleeperDraft();
  }
</script>

<section class="panel connect-panel" aria-label="Sleeper connection">
  <div class="section-header">
    <h2><Icon name="link" size={17} /> Find your league</h2>
  </div>

  <form class="lookup-form" onsubmit={submitLookup}>
    <div class="field-row">
      <label class="field" for="connect-username">
        <span>Sleeper username</span>
      </label>
      {#if usernameInput}
        <button type="button" class="text-link" onclick={onResetLookup}>Not you?</button>
      {/if}
    </div>
    <input
      id="connect-username"
      class="input"
      bind:value={usernameInput}
      type="text"
      placeholder="e.g. gridiron_gary"
      autocomplete="username"
    />
    <button class="btn btn-primary btn-block" type="submit" disabled={isConnecting}>
      {#if isConnecting}<span class="spinner"></span>{/if}
      {isConnecting ? "Finding" : "Find leagues"}
    </button>
  </form>

  <div class="alternate-connections">
    <div class="mini-links">
      <button type="button" class="text-link" onclick={() => (leaguePanelOpen = !leaguePanelOpen)}>Paste a league URL</button>
      <button type="button" class="text-link" onclick={() => (draftPanelOpen = !draftPanelOpen)}>Paste a draft ID</button>
    </div>

    {#if leaguePanelOpen}
      <form class="mini-form" onsubmit={submitLeagueLookup}>
        {#if noLeaguesFound}
          <p class="callout callout-warning">
            <Icon name="alert" size={15} />
            No leagues found for {connectPayload?.season}. If your league was just created, paste its link below.
          </p>
        {/if}
        <label class="field">
          <span>League URL or ID</span>
          <input class="input" bind:value={leagueInput} type="text" placeholder="sleeper.com/leagues/..." />
        </label>
        <label class="field">
          <span>Season</span>
          <input class="input" bind:value={seasonInput} type="text" placeholder="Auto" inputmode="numeric" />
        </label>
        <button class="btn btn-secondary btn-block" type="submit" disabled={isConnecting}>
          {isConnecting ? "Finding" : "Find this league"}
        </button>
      </form>
    {/if}

    {#if draftPanelOpen}
      <form class="mini-form" onsubmit={submitAdvanced}>
        <label class="field">
          <span>Sleeper draft ID</span>
          <input class="input" bind:value={draftInput} type="text" placeholder="Paste a draft ID" />
        </label>
        <label class="field">
          <span>Your roster ID or slot</span>
          <input class="input" bind:value={userRosterIdInput} type="text" placeholder="Optional" />
        </label>
        <button class="btn btn-secondary btn-block" type="submit" disabled={isLoading}>{isLoading ? "Loading" : "Load draft"}</button>
      </form>
    {/if}

    <div class="demo-row">
      <button type="button" class="text-link" onclick={onLoadMockDraft}>Try a demo draft</button>
      <span class="demo-caption">Loads a sample board for testing only, not a source of player values.</span>
    </div>
  </div>

  {#if connectPayload && connectPayload.leagues.length > 0}
    <div class="connect-results">
      <div class="results-heading">
        <strong>{connectPayload.user.displayName ?? connectPayload.user.username ?? connectPayload.user.userId}</strong>
        <span>{connectPayload.season} season - {connectPayload.leagues.length} league{connectPayload.leagues.length === 1 ? "" : "s"}</span>
      </div>

      {#if showLeaguePicker}
        <div class="eyebrow">Choose a league</div>
        <div class="option-list" role="radiogroup" aria-label="Leagues">
          {#each connectPayload.leagues as league (league.leagueId)}
            <label class="option-row" class:selected={league.leagueId === selectedLeagueId}>
              <input
                type="radio"
                name="league-select"
                checked={league.leagueId === selectedLeagueId}
                onchange={() => onSelectLeague(league)}
              />
              <span class="option-copy">
                <strong>{league.name}</strong>
                <small>{league.status} - {league.totalRosters ?? "?"} teams - {league.scoring}</small>
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if showDraftPicker && selectedLeague}
        <div class="eyebrow">Choose a draft</div>
        <div class="option-list" role="radiogroup" aria-label="Drafts">
          {#each selectedLeague.drafts as draft (draft.draftId)}
            <label class="option-row" class:selected={draft.draftId === selectedDraftId}>
              <input
                type="radio"
                name="draft-select"
                checked={draft.draftId === selectedDraftId}
                onchange={() => onSelectDraft(draft)}
              />
              <span class="option-copy">
                <strong>{draft.name}</strong>
                <small>{draft.status} - {draft.type} - {draft.rounds ?? "?"} rounds</small>
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if showReadyCard && selectedLeague && selectedDraft}
        <div class="confirm-row">
          <strong>{selectedLeague.name}</strong>
          {#if selectedDraft.name !== selectedLeague.name}
            <span class="confirm-league">{selectedDraft.name}</span>
          {/if}
          <span class="confirm-summary">{confirmSummary(selectedLeague, selectedDraft)}</span>
          <button class="btn btn-primary btn-block" type="button" disabled={isLoading} onclick={onOpenSelectedDraft}>
            {#if isLoading}<span class="spinner"></span>{/if}
            {isLoading ? "Opening" : "Open draft room"}
          </button>
        </div>
      {:else if selectedLeague && selectedLeague.drafts.length === 0}
        <p class="empty">No drafts found for this league.</p>
      {/if}
    </div>
  {/if}

  {#if activeDraftId || activeUserRosterId}
    <div class="connection-meta">
      <strong>{activeSourceLabel}</strong>
      {#if activeDraftId}
        <span>{activeDraftId}</span>
      {/if}
      {#if activeUserRosterId}
        <span>Roster/slot {activeUserRosterId}</span>
      {/if}
    </div>
  {/if}

  {#if loadError}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{loadError}</p>
  {/if}
</section>

<style>
  .connect-panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    max-width: 460px;
    margin: 0 auto;
  }

  .section-header h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-lg);
    margin-top: 2px;
  }

  .lookup-form {
    display: grid;
    gap: 10px;
  }

  .field-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .field-row .field {
    gap: 0;
  }

  .text-link {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .text-link:hover {
    color: var(--text-primary);
  }

  .alternate-connections {
    display: grid;
    gap: var(--space-3);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  .mini-links {
    display: flex;
    justify-content: center;
    gap: 18px;
  }

  .mini-links .text-link {
    font-size: var(--text-xs);
    text-decoration: none;
    color: var(--text-muted);
  }

  .mini-links .text-link:hover {
    color: var(--text-primary);
  }

  .mini-form {
    display: grid;
    gap: 10px;
    margin-top: -4px;
  }

  .mini-form .callout {
    margin: 0;
  }

  .connect-results {
    display: grid;
    gap: 10px;
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }

  .results-heading strong {
    display: block;
  }

  .results-heading span {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .eyebrow {
    margin-top: 4px;
  }

  .option-list {
    display: grid;
  }

  .option-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }

  .option-list .option-row:last-child {
    border-bottom: 0;
  }

  .option-row input[type="radio"] {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    accent-color: var(--accent);
  }

  .option-row.selected {
    border-left: 2px solid var(--accent);
    border-bottom-color: transparent;
    background: var(--accent-soft);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    padding-left: 10px;
  }

  .option-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .option-copy strong {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .option-row.selected .option-copy strong {
    font-weight: 700;
  }

  .option-copy small {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .confirm-row {
    display: grid;
    gap: 8px;
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  .confirm-summary {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .confirm-league {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .demo-row {
    display: grid;
    justify-items: center;
    gap: 3px;
    text-align: center;
  }

  .demo-row .text-link {
    font-size: var(--text-sm);
  }

  .demo-caption {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .connection-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .connection-meta strong {
    color: var(--text-secondary);
  }
</style>

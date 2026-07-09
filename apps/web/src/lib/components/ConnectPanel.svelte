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
    onSelectLeague: (league: ConnectLeague) => void;
    onSelectDraft: (draft: ConnectDraft) => void;
    onOpenSelectedDraft: () => void;
    onConnectSleeperDraft: () => void;
    onLoadMockDraft: () => void;
  } = $props();

  const selectedLeague = $derived(connectPayload?.leagues.find((league) => league.leagueId === selectedLeagueId) ?? null);
  const selectedDraft = $derived(selectedLeague?.drafts.find((draft) => draft.draftId === selectedDraftId) ?? null);
  const hasMultipleLeagues = $derived((connectPayload?.leagues.length ?? 0) > 1);
  const hasMultipleDrafts = $derived((selectedLeague?.drafts.length ?? 0) > 1);
  const showLeaguePicker = $derived(hasMultipleLeagues);
  const showDraftPicker = $derived(Boolean(selectedLeague && hasMultipleDrafts));
  const showReadyCard = $derived(Boolean(selectedLeague && selectedDraft));

  function formatRosterSlots(slots: Record<string, number>) {
    const order = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "K", "DEF"];
    return order
      .filter((slot) => slots[slot])
      .map((slot) => `${slot} ${slots[slot]}`)
      .join(" / ");
  }

  function teamMatchLabel(league: ConnectLeague, draft: ConnectDraft) {
    if (league.userRosterId) {
      return `Matched to your roster ${league.userRosterId}`;
    }
    if (draft.userDraftSlot) {
      return `Matched to draft slot ${draft.userDraftSlot}`;
    }
    return "Team match will be checked after opening";
  }

  function submitLookup(event: SubmitEvent) {
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
    <h2><Icon name="link" size={17} /> Connect Sleeper</h2>
  </div>

  <form class="lookup-form" onsubmit={submitLookup}>
    <label class="field">
      <span>Sleeper username or ID</span>
      <input class="input" bind:value={usernameInput} type="text" placeholder="Sleeper username" autocomplete="username" />
    </label>
    <label class="field">
      <span>League URL or ID</span>
      <input class="input" bind:value={leagueInput} type="text" placeholder="Optional, useful for new leagues" />
    </label>
    <label class="field">
      <span>Season</span>
      <input class="input" bind:value={seasonInput} type="text" placeholder="Auto" inputmode="numeric" />
    </label>
    <button class="btn btn-primary" type="submit" disabled={isConnecting}>
      {#if isConnecting}<span class="spinner"></span>{/if}
      {isConnecting ? "Finding" : "Find leagues"}
    </button>
  </form>

  {#if connectPayload}
    <div class="connect-results">
      <div class="results-heading">
        <strong>{connectPayload.user.displayName ?? connectPayload.user.username ?? connectPayload.user.userId}</strong>
        <span>{connectPayload.season} season - {connectPayload.leagues.length} league{connectPayload.leagues.length === 1 ? "" : "s"}</span>
      </div>

      {#if connectPayload.leagues.length > 0}
        {#if showLeaguePicker}
          <section class="choice-column" aria-label="Leagues">
            <h3>Choose a league</h3>
            <div class="option-list">
              {#each connectPayload.leagues as league (league.leagueId)}
                <button
                  class="option-row"
                  class:selected={league.leagueId === selectedLeagueId}
                  type="button"
                  onclick={() => onSelectLeague(league)}
                >
                  <strong>{league.name}</strong>
                  <span>{league.status} - {league.totalRosters ?? "?"} teams - {league.scoring}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if showDraftPicker && selectedLeague}
          <section class="choice-column" aria-label="Drafts">
            <h3>Choose a draft</h3>
            <div class="option-list">
              {#each selectedLeague.drafts as draft (draft.draftId)}
                <button
                  class="option-row"
                  class:selected={draft.draftId === selectedDraftId}
                  type="button"
                  onclick={() => onSelectDraft(draft)}
                >
                  <strong>{draft.name}</strong>
                  <span>{draft.status} - {draft.type} - {draft.rounds ?? "?"} rounds</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if showReadyCard && selectedLeague && selectedDraft}
          <div class="ready-card">
            <div class="ready-copy">
              <strong>{selectedLeague.name}</strong>
              <span>
                {selectedLeague.totalRosters ?? "?"} teams - {selectedLeague.scoring} - {selectedDraft.type} - {selectedDraft.rounds ?? "?"} rounds
              </span>
              <span class="ready-meta">{formatRosterSlots(selectedLeague.rosterSlots) || "Roster settings unavailable"}</span>
              <span class="ready-match">{teamMatchLabel(selectedLeague, selectedDraft)}</span>
            </div>
            <button class="btn btn-primary" type="button" disabled={isLoading} onclick={onOpenSelectedDraft}>
              {#if isLoading}<span class="spinner"></span>{/if}
              {isLoading ? "Opening" : "Open draft room"}
            </button>
          </div>
        {:else if selectedLeague && selectedLeague.drafts.length === 0}
          <p class="empty">No drafts found for this league.</p>
        {/if}
      {:else}
        <p class="empty">No leagues found from the user listing. For newly-created predraft leagues, paste the Sleeper league URL or ID above.</p>
      {/if}
    </div>
  {/if}

  <details class="disclosure">
    <summary>Advanced draft ID</summary>
    <form class="lookup-form advanced-form" onsubmit={submitAdvanced}>
      <label class="field">
        <span>Sleeper draft ID</span>
        <input class="input" bind:value={draftInput} type="text" placeholder="Paste a draft ID" />
      </label>
      <label class="field">
        <span>Your roster ID or slot</span>
        <input class="input" bind:value={userRosterIdInput} type="text" placeholder="Optional" />
      </label>
      <button class="btn btn-secondary" type="submit" disabled={isLoading}>{isLoading ? "Loading" : "Load draft"}</button>
    </form>
  </details>

  <details class="disclosure">
    <summary>Demo mode</summary>
    <p class="disclosure-copy">Load a sample draft board for testing the interface. Demo data will not be restored on the next launch.</p>
    <button class="btn btn-secondary" type="button" onclick={onLoadMockDraft}>Try demo draft</button>
  </details>

  <div class="connection-meta">
    <strong>{activeSourceLabel}</strong>
    {#if activeDraftId}
      <span>{activeDraftId}</span>
    {/if}
    {#if activeUserRosterId}
      <span>Roster/slot {activeUserRosterId}</span>
    {/if}
  </div>

  {#if loadError}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{loadError}</p>
  {/if}
</section>

<style>
  .connect-panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
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
    grid-template-columns: minmax(180px, 0.9fr) minmax(0, 1.25fr);
    gap: var(--space-3);
    align-items: end;
  }

  .lookup-form button {
    grid-column: 1 / -1;
  }

  .connect-results {
    display: grid;
    gap: var(--space-4);
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

  .choice-column h3 {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .option-list {
    display: grid;
    gap: 8px;
  }

  .option-row {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    padding: 10px 12px;
    text-align: left;
    white-space: normal;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .option-row:hover {
    background: var(--surface-raised);
    border-color: var(--border-strong);
  }

  .option-row.selected {
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }

  .option-row strong {
    display: block;
  }

  .option-row span {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .ready-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    padding: 14px 16px;
  }

  .ready-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .ready-copy strong {
    font-size: var(--text-md);
  }

  .ready-copy span {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .ready-meta {
    color: var(--text-muted) !important;
    font-size: var(--text-xs) !important;
  }

  .ready-match {
    color: var(--accent) !important;
    font-weight: 700;
  }

  .ready-card .btn {
    flex-shrink: 0;
  }

  .disclosure {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  .disclosure summary {
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-sm);
    padding: 6px 4px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }

  .disclosure summary::-webkit-details-marker {
    display: none;
  }

  .disclosure summary:hover {
    color: var(--text-primary);
  }

  .disclosure-copy {
    margin: 8px 0 10px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .advanced-form {
    margin-top: 10px;
  }

  .connection-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .connection-meta strong {
    color: var(--text-primary);
  }

  @media (max-width: 720px) {
    .lookup-form {
      grid-template-columns: 1fr;
    }

    .ready-card {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>

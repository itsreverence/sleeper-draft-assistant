<script lang="ts">
  import { onMount } from "svelte";
  import type { DraftState, PlayerPreferenceLevel, PlayerPreferences, Position } from "../types";
  import { searchDraftPlayers } from "../player-search";
  import Icon from "./Icon.svelte";
  import PlayerPreferenceMenu from "./PlayerPreferenceMenu.svelte";

  let {
    state: draftState,
    preferences = {},
    onSetPreference,
    onAskAboutPlayer,
    onClose,
  }: {
    state: DraftState;
    preferences?: PlayerPreferences;
    onSetPreference: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onAskAboutPlayer?: (playerName: string) => void;
    onClose: () => void;
  } = $props();

  const positions: Array<Position | null> = [null, "QB", "RB", "WR", "TE", "K", "DEF"];
  let query = $state("");
  let position: Position | null = $state(null);
  let searchInput: HTMLInputElement;
  const results = $derived(searchDraftPlayers(draftState, query, position, preferences));
  const preferenceCount = $derived(Object.keys(preferences).length);

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  function askAboutPlayer(playerName: string) {
    onClose();
    onAskAboutPlayer?.(playerName);
  }

  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInput.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="dialog-backdrop" type="button" aria-label="Close player search" onclick={onClose}></button>
<div class="player-dialog" role="dialog" aria-modal="true" aria-labelledby="player-search-title">
  <header>
    <div>
      <span class="eyebrow">Draft preferences</span>
      <h2 id="player-search-title">Find player</h2>
    </div>
    <div class="header-actions">
      {#if preferenceCount > 0}<span>{preferenceCount} set</span>{/if}
      <button type="button" aria-label="Close player search" onclick={onClose}>
        <Icon name="close" size={16} />
      </button>
    </div>
  </header>

  <div class="search-field">
    <Icon name="search" size={17} />
    <input
      bind:this={searchInput}
      bind:value={query}
      type="search"
      placeholder="Search players"
      aria-label="Search players"
      autocomplete="off"
      spellcheck="false"
    />
  </div>

  <div class="position-filter" aria-label="Filter by position">
    {#each positions as option}
      <button
        type="button"
        aria-pressed={position === option}
        class:active={position === option}
        onclick={() => (position = option)}
      >
        {option ?? "All"}
      </button>
    {/each}
  </div>

  <div class="results" aria-live="polite">
    {#if results.length > 0}
      <ul>
        {#each results as result (result.player.id)}
          <li class:drafted={Boolean(result.draftedBy)}>
            <div class="player-copy">
              <strong>{result.player.name}</strong>
              <div class="player-meta">
                <span>{result.player.position}</span>
                <span>{result.player.team || "FA"}</span>
                {#if result.player.importedRank}<span>Rank {result.player.importedRank}</span>{/if}
                {#if result.player.realTimeAdp ?? result.player.adp}
                  <span>ADP {(result.player.realTimeAdp ?? result.player.adp)?.toFixed(1)}</span>
                {/if}
              </div>
              {#if result.draftedBy}<small>Drafted by {result.draftedBy.name}</small>{/if}
            </div>
            <div class="player-actions">
              <PlayerPreferenceMenu
                playerId={result.player.id}
                playerName={result.player.name}
                preference={result.preference}
                onSetPreference={result.draftedBy ? undefined : onSetPreference}
              />
              {#if !result.draftedBy && onAskAboutPlayer}
                <button
                  class="ask-player"
                  type="button"
                  aria-label={`Ask AI about ${result.player.name}`}
                  onclick={() => askAboutPlayer(result.player.name)}
                >
                  <Icon name="message" size={13} />
                  Ask AI
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else if query.trim()}
      <p class="empty-state">No matching players.</p>
    {:else}
      <p class="empty-state">Search for a player. Saved preferences appear here when the search is empty.</p>
    {/if}
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    z-index: 50;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 0.58);
    cursor: default;
  }

  .player-dialog {
    position: fixed;
    z-index: 51;
    top: 10vh;
    left: 50%;
    display: grid;
    width: min(660px, calc(100vw - 32px));
    max-height: 80vh;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    transform: translateX(-50%);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px 12px;
  }

  header > div:first-child {
    display: grid;
    gap: 3px;
  }

  header h2 {
    font-size: var(--text-xl);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-actions > span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .header-actions > button {
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

  .search-field {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    margin: 0 18px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 0 12px;
    color: var(--text-muted);
  }

  .search-field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .search-field input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 11px 0;
    color: var(--text-primary);
    font: inherit;
  }

  .position-filter {
    display: flex;
    gap: 4px;
    padding: 10px 18px 12px;
    overflow-x: auto;
  }

  .position-filter button {
    flex: 0 0 auto;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 6px 9px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .position-filter button.active {
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .results {
    min-height: 160px;
    overflow-y: auto;
    border-top: 1px solid var(--border);
  }

  .results ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .results li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 66px;
    border-bottom: 1px solid var(--border);
    padding: 10px 18px;
  }

  .results li.drafted {
    opacity: 0.62;
  }

  .player-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .player-copy > strong {
    overflow: hidden;
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .player-copy > small {
    color: var(--warning);
    font-size: var(--text-xs);
  }

  .player-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
  }

  .ask-player {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    padding: 7px 4px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .ask-player:hover {
    color: var(--text-primary);
  }

  .empty-state {
    padding: 32px 18px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }

  @media (max-width: 560px) {
    .player-dialog {
      top: auto;
      bottom: 0;
      width: 100%;
      max-height: 88vh;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }

    .results li {
      align-items: flex-start;
      padding-inline: 14px;
    }

    .player-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .search-field {
      margin-inline: 14px;
    }

    .position-filter {
      padding-inline: 14px;
    }
  }
</style>

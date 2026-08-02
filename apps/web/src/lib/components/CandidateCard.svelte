<script lang="ts">
  import type { DraftOption, PlayerPreferenceLevel } from "../types";
  import { rosterFitLabel, sourceLabel } from "../format";
  import Icon from "./Icon.svelte";
  import PlayerPreferenceMenu from "./PlayerPreferenceMenu.svelte";

  let {
    candidate,
    rank,
    preference = null,
    onSetPreference,
    onDiscuss,
  }: {
    candidate: DraftOption;
    rank: number;
    preference?: PlayerPreferenceLevel | null;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onDiscuss?: (playerName: string) => void;
  } = $props();

  let detailsOpen = $state(false);

  function discussCandidate() {
    onDiscuss?.(candidate.player.name);
  }
</script>

<section
  class="candidate-card"
  class:excluded={preference === "exclude"}
  class:pinned={preference === "pin"}
>
  <div class="candidate-main">
    <div class="rank">{rank}</div>
    <div class="candidate-copy">
      <div class="name-row">
        <h3>{candidate.player.name}</h3>
        <span class="strategy-badge">AI alternative</span>
        {#if preference}
          <span class="preference-badge preference-{preference}">{preference === "pin" ? "prioritized" : preference === "fade" ? "deprioritized" : "excluded"}</span>
        {/if}
      </div>
      <p>
        {candidate.player.team} - {candidate.player.position}
      </p>
      {#if candidate.player.importedRank}
        <p class="import-meta">
          Rank {candidate.player.importedRank}{candidate.player.tier ? ` - Tier ${candidate.player.tier}` : ""}{candidate.player.byeWeek ? ` - Bye ${candidate.player.byeWeek}` : ""}
        </p>
      {:else}
        <p class="import-meta">{sourceLabel(candidate)}</p>
      {/if}
    </div>
  </div>

  <div class="actions">
    <PlayerPreferenceMenu
      playerId={candidate.player.id}
      playerName={candidate.player.name}
      {preference}
      {onSetPreference}
    />
    <button
      class="ask-action"
      type="button"
      title={`Ask about drafting ${candidate.player.name}`}
      onclick={discussCandidate}
    >
      <Icon name="message" size={13} />
      Ask about pick
    </button>
    <button class="details-toggle" type="button" aria-expanded={detailsOpen} onclick={() => (detailsOpen = !detailsOpen)}>
      {detailsOpen ? "Hide evidence" : "View evidence"}
    </button>
  </div>

  {#if detailsOpen}
    <div class="details">
      <div class="signal-row">
        <span>Ordered by {candidate.orderLabel}</span>
        <span>{rosterFitLabel(candidate.rosterFit)}</span>
        {#if candidate.requiredToCompleteLineup}<span>Required starter position</span>{/if}
      </div>
      {#if candidate.evidence.length > 0}
        <ul>
          {#each candidate.evidence as evidence}
            <li>{evidence}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

</section>

<style>
  .candidate-card {
    border-top: 1px solid var(--border);
    padding: var(--space-4) 0;
    transition: opacity var(--transition-fast);
  }

  .candidate-card:hover {
    border-color: var(--border-strong);
  }

  .candidate-card.pinned {
    border-color: var(--accent-border);
  }

  .candidate-card.excluded {
    opacity: 0.62;
  }

  .candidate-main {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .rank {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-top: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .candidate-copy {
    flex: 1;
    min-width: 0;
  }

  .name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .candidate-copy h3 {
    font-size: var(--text-md);
    font-weight: 700;
  }

  .candidate-copy p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .import-meta {
    margin-top: 4px !important;
    font-size: var(--text-xs) !important;
    font-weight: 600;
  }

  .preference-badge {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 3px 7px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;
  }

  .strategy-badge {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    padding: 3px 7px;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
  }

  .preference-pin {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .preference-fade {
    border-color: var(--warning-border);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .preference-exclude {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  .actions > button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    padding: 7px 10px;
  }

  .actions > button:hover {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  .details-toggle {
    margin-left: auto;
  }

  .actions .details-toggle {
    border: 0;
    background: transparent;
    padding-right: 2px;
    padding-left: 2px;
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .actions .details-toggle:hover {
    border: 0;
    background: transparent;
    color: var(--text-primary);
  }

  .details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .signal-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .signal-row span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .details ul {
    margin: 0;
    padding-left: 18px;
  }

  .details li {
    margin-bottom: 4px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .details li:last-child {
    margin-bottom: 0;
  }

</style>

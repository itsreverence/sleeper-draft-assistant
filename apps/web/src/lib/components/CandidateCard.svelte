<script lang="ts">
  import type { CandidateSignal, PlayerPreferenceLevel } from "../types";
  import { rosterFitLabel, sourceLabel } from "../format";

  let {
    candidate,
    rank,
    preference = null,
    onSetPreference,
    onWhatIf,
  }: {
    candidate: CandidateSignal;
    rank: number;
    preference?: PlayerPreferenceLevel | null;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onWhatIf?: (playerName: string) => void;
  } = $props();

  const returnPct = $derived(Math.round(candidate.returnProbability * 100));
  const returnTone = $derived(returnPct >= 65 ? "ready" : returnPct >= 40 ? "neutral" : "warning");
  const fitTone = $derived(
    candidate.rosterFit === "need" ? "ready" : candidate.rosterFit === "luxury" ? "info" : "neutral",
  );

  function togglePreference(nextPreference: PlayerPreferenceLevel) {
    onSetPreference?.(candidate.player.id, preference === nextPreference ? null : nextPreference);
  }
</script>

<section class:excluded={preference === "exclude"} class:pinned={preference === "pin"} class="candidate-card">
  <div class="candidate-main">
    <div class="rank">{rank}</div>
    <div class="candidate-copy">
      <div class="name-row">
        <h3>{candidate.player.name}</h3>
        {#if preference}
          <span class="preference-badge preference-{preference}">{preference}</span>
        {/if}
      </div>
      <p>{candidate.player.team} - {candidate.player.position}</p>
      <div class="badge-row">
        <span class="pill pill-neutral">{sourceLabel(candidate)}</span>
        {#if candidate.player.importedRank}
          <span class="import-meta">
            Rank {candidate.player.importedRank}{candidate.player.tier ? ` / Tier ${candidate.player.tier}` : ""}{candidate.player.byeWeek ? ` / Bye ${candidate.player.byeWeek}` : ""}
          </span>
        {/if}
      </div>
    </div>
    <strong class="score">{candidate.score.toFixed(1)}</strong>
  </div>
  <div class="signal-grid">
    <span class="pill pill-{fitTone}">{rosterFitLabel(candidate.rosterFit)}</span>
    <span class="pill pill-neutral">{candidate.valueLabel}</span>
    <span class="pill pill-neutral">{candidate.scarcityLabel}</span>
    <span class="pill pill-{returnTone}">{returnPct}% return</span>
  </div>
  <ul>
    {#each candidate.reasons as reason}
      <li>{reason}</li>
    {/each}
  </ul>
  <div class="preference-actions" aria-label={`Local controls for ${candidate.player.name}`}>
    <button class:active={preference === "pin"} type="button" onclick={() => togglePreference("pin")}>Pin</button>
    <button class:active={preference === "fade"} type="button" onclick={() => togglePreference("fade")}>Fade</button>
    <button class:active={preference === "exclude"} type="button" onclick={() => togglePreference("exclude")}>Exclude</button>
    <button type="button" onclick={() => onWhatIf?.(candidate.player.name)}>What if</button>
  </div>
</section>

<style>
  .candidate-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-4);
    transition: border-color var(--transition-base), transform var(--transition-base), opacity var(--transition-fast);
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
    margin-bottom: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .preference-badge {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    padding: 3px 7px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
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

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .import-meta {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .score {
    flex-shrink: 0;
    color: var(--accent);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1;
  }

  .signal-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin: 12px 0;
  }

  .signal-grid .pill {
    justify-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .candidate-card ul {
    margin: 0;
    padding-left: 18px;
  }

  .candidate-card li {
    margin-bottom: 4px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .candidate-card li:last-child {
    margin-bottom: 0;
  }

  .preference-actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin-top: 12px;
  }

  .preference-actions button {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
    padding: 7px 8px;
  }

  .preference-actions button:hover,
  .preference-actions button.active {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  @media (max-width: 560px) {
    .signal-grid,
    .preference-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

<script lang="ts">
  import { WEEKLY_SCORING_REMINDER } from "@sleeper-draft-assistant/engine";
  import { formatConfidence } from "../format";
  import { positionLabel } from "../team-attention";
  import type { TeamDataReadiness, WeeklyProjectionImportSummary } from "../types";
  import DataLine from "./DataLine.svelte";
  import Icon from "./Icon.svelte";

  let {
    readiness,
    weeklySummary = null,
    isLoading = false,
    open = $bindable(false),
  }: {
    readiness: TeamDataReadiness;
    weeklySummary?: WeeklyProjectionImportSummary | null;
    isLoading?: boolean;
    open?: boolean;
  } = $props();

  const rosterCoverage = $derived(Math.round(readiness.rosterProjectionCoverage * 100));
  const matchRate = $derived(readiness.importMatchRate === null ? null : Math.round(readiness.importMatchRate * 100));
  // The scoring reminder always applies to a loaded import, so it lives in Weekly projections and doesn't mark this line.
  const warnings = $derived(readiness.warnings.filter((warning) => warning !== WEEKLY_SCORING_REMINDER));
  const summary = $derived(isLoading
    ? "Checking weekly data..."
    : `${readiness.projectedRosterPlayers}/${readiness.eligibleRosterPlayers} roster players · ${matchRate === null ? "import not loaded" : `${matchRate}% matched`} · ${formatConfidence(readiness.confidence)}`);
</script>

<DataLine name="coverage" title="Coverage" {summary} warn={!isLoading && warnings.length > 0} bind:open>
  {#if isLoading}
    <p class="context">Checking weekly data...</p>
  {:else}
    <p class="headline">{readiness.headline}</p>

    <div class="coverage-row">
      <div>
        <span>Roster coverage</span>
        <strong>{rosterCoverage}%</strong>
      </div>
      <div>
        <span>Import matching</span>
        <strong>{matchRate === null ? "Not loaded" : `${matchRate}%`}</strong>
      </div>
    </div>

    <div class="coverage-track" role="meter" aria-label="Roster projection coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rosterCoverage}>
      <span style={`width:${rosterCoverage}%`}></span>
    </div>

    <div class="position-list" aria-label="Projection position coverage details" role="group">
      {#each readiness.relevantPositions as position}
        {@const result = weeklySummary?.positionResults.find((item) => item.position === position)}
        <span class:loaded={readiness.loadedPositions.includes(position)}>
          {positionLabel(position)}
          <small>{readiness.loadedPositions.includes(position) ? "Loaded" : result?.matched === 0 ? result.rowsParsed === 0 ? "No rows" : "No matches" : "Missing"}</small>
        </span>
      {/each}
    </div>

    <p class="context">{readiness.projectedRosterPlayers}/{readiness.eligibleRosterPlayers} active roster players projected{readiness.activeSeason && readiness.activeWeek ? ` for ${readiness.activeSeason} Week ${readiness.activeWeek}` : ""}.</p>

    {#if warnings.length > 0}
      <div class="warning-list">
        {#each warnings as warning}
          <p><Icon name="alert" size={14} />{warning}</p>
        {/each}
      </div>
    {/if}
  {/if}
</DataLine>

<style>
  .headline,
  .context {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .headline {
    font-weight: 600;
  }

  .context {
    font-size: var(--text-xs);
  }

  .coverage-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    overflow: hidden;
  }

  .coverage-row div {
    padding: var(--space-2) var(--space-3);
  }

  .coverage-row div + div {
    border-left: 1px solid var(--border);
  }

  .coverage-row span,
  .coverage-row strong {
    display: block;
  }

  .coverage-row span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .coverage-row strong {
    margin-top: 3px;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .coverage-track {
    height: 5px;
    border-radius: 3px;
    background: var(--surface-sunken);
    overflow: hidden;
  }

  .coverage-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  .position-list {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .position-list span {
    display: grid;
    gap: 2px;
    border-right: 1px solid var(--border);
    padding: var(--space-2) var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    text-align: center;
  }

  .position-list span:last-child {
    border-right: 0;
  }

  .position-list span.loaded {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .position-list small {
    color: inherit;
    font-size: var(--text-xs);
  }

  .warning-list {
    display: grid;
    gap: var(--space-2);
  }

  .warning-list p {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    color: var(--warning);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  @media (max-width: 760px) {
    .position-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>

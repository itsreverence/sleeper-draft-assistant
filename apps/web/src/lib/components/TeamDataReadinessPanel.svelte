<script lang="ts">
  import type { TeamDataReadiness } from "../types";
  import Icon from "./Icon.svelte";

  let {
    readiness,
    isLoading = false,
  }: {
    readiness: TeamDataReadiness | null;
    isLoading?: boolean;
  } = $props();

  const rosterCoverage = $derived(Math.round((readiness?.rosterProjectionCoverage ?? 0) * 100));
  const matchRate = $derived(readiness?.importMatchRate === null || readiness?.importMatchRate === undefined
    ? null
    : Math.round(readiness.importMatchRate * 100));
</script>

<article class="panel readiness-panel">
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Decision data</p>
      <h2><Icon name="checklist" size={17} /> Weekly readiness</h2>
    </div>
    {#if readiness}
      <span class="pill" class:pill-ready={readiness.status === "ready"} class:pill-warning={readiness.status !== "ready"}>
        {readiness.confidence} confidence
      </span>
    {/if}
  </div>

  {#if isLoading}
    <p class="muted">Checking weekly data...</p>
  {:else if !readiness}
    <p class="muted">Open a Sleeper team to evaluate weekly data readiness.</p>
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

    <div class="coverage-track" aria-label={`Roster projection coverage ${rosterCoverage}%`}>
      <span style={`width:${rosterCoverage}%`}></span>
    </div>

    <div class="position-list" aria-label="Projection position coverage">
      {#each readiness.relevantPositions as position}
        <span class:loaded={readiness.loadedPositions.includes(position)}>
          {position === "DEF" ? "DST" : position}
          <small>{readiness.loadedPositions.includes(position) ? "Loaded" : "Missing"}</small>
        </span>
      {/each}
    </div>

    <p class="context">{readiness.projectedRosterPlayers}/{readiness.eligibleRosterPlayers} active roster players projected{readiness.activeSeason && readiness.activeWeek ? ` for ${readiness.activeSeason} Week ${readiness.activeWeek}` : ""}.</p>

    {#if readiness.warnings.length > 0}
      <div class="warning-list">
        {#each readiness.warnings.slice(0, 3) as warning}
          <p><Icon name="alert" size={14} />{warning}</p>
        {/each}
      </div>
    {/if}
  {/if}
</article>

<style>
  .readiness-panel {
    display: grid;
    gap: 10px;
  }

  .muted,
  .headline,
  .context {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .headline {
    color: var(--text-secondary);
    font-weight: 700;
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
    padding: 9px 10px;
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
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.05em;
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
    padding: 7px 4px;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 900;
    text-align: center;
  }

  .position-list span:last-child {
    border-right: 0;
  }

  .position-list span.loaded {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .position-list small {
    color: inherit;
    font-size: 8px;
    text-transform: uppercase;
  }

  .context {
    font-size: var(--text-xs);
  }

  .warning-list {
    display: grid;
    gap: 6px;
  }

  .warning-list p {
    display: flex;
    gap: 7px;
    align-items: flex-start;
    margin: 0;
    color: var(--warning);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  @media (max-width: 720px) {
    .position-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>

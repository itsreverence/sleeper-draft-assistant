<script lang="ts">
  import type { TeamWeekContext, TeamWeekPlayer } from "../types";
  import Icon from "./Icon.svelte";

  let {
    weekContext,
    isLoading = false,
  }: {
    weekContext: TeamWeekContext | null;
    isLoading?: boolean;
  } = $props();

  const scoreLabel = $derived(formatScore(weekContext));
  const statusLabel = $derived(formatStatus(weekContext?.status));

  function formatScore(context: TeamWeekContext | null): string {
    if (!context || (context.userPoints === null && context.opponentPoints === null)) {
      return "Score unavailable";
    }

    return `${formatPoints(context.userPoints)} - ${formatPoints(context.opponentPoints)}`;
  }

  function formatPoints(points: number | null): string {
    return points === null ? "--" : points.toFixed(2);
  }

  function formatStatus(status: TeamWeekContext["status"] | undefined): string {
    if (status === "in_progress") {
      return "In progress";
    }

    if (status === "final") {
      return "Final";
    }

    if (status === "scheduled") {
      return "Scheduled";
    }

    return "Unknown";
  }

  function playerLabel(player: TeamWeekPlayer): string {
    const score = player.points === null ? "--" : player.points.toFixed(1);
    const slot = player.slot ? `${player.slot} ` : "";
    return `${slot}${player.name} (${player.team} ${player.position}) ${score}`;
  }
</script>

<article class="panel team-week-panel">
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">This week</p>
      <h2><Icon name="calendar" size={17} /> Matchup context</h2>
    </div>
    {#if weekContext}
      <span class="pill pill-info">Week {weekContext.week}</span>
    {/if}
  </div>

  {#if isLoading}
    <p class="muted">Loading Sleeper matchup data...</p>
  {:else if !weekContext}
    <p class="muted">No weekly matchup row is available from Sleeper yet. Team advice will use roster structure only.</p>
  {:else}
    <div class="matchup-summary">
      <div>
        <span>Status</span>
        <strong>{statusLabel}</strong>
      </div>
      <div>
        <span>Score</span>
        <strong>{scoreLabel}</strong>
      </div>
    </div>

    <div class="opponent-row">
      <span>Your matchup</span>
      <strong>{weekContext.userTeamName} vs {weekContext.opponentTeamName ?? "opponent not assigned"}</strong>
    </div>

    <div class="starter-grid">
      <section>
        <h3>Your starters</h3>
        {#if weekContext.userStarters.length}
          <ul>
            {#each weekContext.userStarters as player}
              <li>{playerLabel(player)}</li>
            {/each}
          </ul>
        {:else}
          <p class="muted compact-copy">No starters reported yet.</p>
        {/if}
      </section>
      <section>
        <h3>Opponent starters</h3>
        {#if weekContext.opponentStarters.length}
          <ul>
            {#each weekContext.opponentStarters as player}
              <li>{playerLabel(player)}</li>
            {/each}
          </ul>
        {:else}
          <p class="muted compact-copy">No opponent starters reported yet.</p>
        {/if}
      </section>
    </div>

    <p class="muted compact-copy">Sleeper matchup data is lineup and scoring state, not projections.</p>
  {/if}
</article>

<style>
  .team-week-panel {
    display: grid;
    gap: 10px;
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .compact-copy {
    font-size: var(--text-xs);
  }

  .matchup-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .matchup-summary div,
  .opponent-row {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 9px 10px;
  }

  .matchup-summary span,
  .opponent-row span {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .matchup-summary strong,
  .opponent-row strong {
    display: block;
    margin-top: 4px;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .starter-grid {
    display: grid;
    gap: 10px;
  }

  .starter-grid section {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 10px;
  }

  .starter-grid h3 {
    margin: 0 0 7px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .starter-grid ul {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .starter-grid li {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.35;
  }
</style>

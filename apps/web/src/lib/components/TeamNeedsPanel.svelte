<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { TeamNeedsSummary } from "../types";

  let { needs }: { needs: TeamNeedsSummary | null } = $props();

  function formatPositions(positions: string[]): string {
    return positions.length > 0 ? positions.join(" / ") : "None";
  }
</script>

<article class="panel team-needs-panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="target" size={17} /> Roster structure</h2>
    </div>
  </div>

  {#if needs}
    <p class="headline">{needs.headline}</p>

    <div class="need-grid" aria-label="Team needs summary">
      <div>
        <span class="label">Weakest</span>
        <strong>{formatPositions(needs.weakestPositions)}</strong>
      </div>
      <div>
        <span class="label">Open slots</span>
        <strong>{needs.openStarterSlots.length}</strong>
      </div>
      <div>
        <span class="label">Thin</span>
        <strong>{formatPositions(needs.thinPositions)}</strong>
      </div>
      <div>
        <span class="label">Surplus</span>
        <strong>{formatPositions(needs.surplusPositions)}</strong>
      </div>
    </div>

    <p class="flex-pressure">{needs.flexPressure}</p>

    <div class="lineup-block">
      <p class="section-label">Deterministic lineup</p>
      <div class="lineup-list">
        {#each needs.lineup as assignment}
          <div class:open={!assignment.player} class="lineup-row">
            <span class="slot-label">{assignment.slot}</span>
            {#if assignment.player}
              <span class="player-name">{assignment.player.name}</span>
              <span class="player-meta">{assignment.player.team} ù {assignment.player.position}</span>
            {:else}
              <span class="player-name muted">Open</span>
              <span class="player-meta">{assignment.eligiblePositions.join("/")}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="facts-block">
      <p class="section-label">Engine facts</p>
      <ul>
        {#each needs.facts.slice(0, 5) as fact}
          <li>{fact}</li>
        {/each}
      </ul>
    </div>

    <p class="constraint">Roster structure only. This does not include weekly projections, matchups, waiver availability, or player news yet.</p>
  {:else}
    <p class="empty">Team needs will appear after Sleeper roster context loads.</p>
  {/if}
</article>

<style>
  .team-needs-panel {
    display: grid;
    gap: var(--space-3);
  }

  .panel-heading.compact h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: var(--text-lg);
  }

  .headline {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 750;
    line-height: 1.45;
  }

  .need-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .need-grid div {
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    padding: 9px 10px;
  }

  .label {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .need-grid strong {
    display: block;
    margin-top: 3px;
    color: var(--text-primary);
    font-size: var(--text-sm);
    line-height: 1.2;
  }

  .flex-pressure,
  .constraint {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .lineup-block,
  .facts-block {
    display: grid;
    gap: 8px;
  }

  .section-label {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .lineup-list {
    display: grid;
    gap: 2px;
  }

  .lineup-row {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    padding: 8px 10px;
  }

  .lineup-row.open {
    border: 1px solid var(--warning-border);
    background: var(--warning-soft);
  }

  .slot-label,
  .player-meta {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .player-name {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player-name.muted {
    color: var(--text-secondary);
  }

  .facts-block ul {
    display: grid;
    gap: 5px;
    margin: 0;
    padding-left: 18px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  @media (max-width: 520px) {
    .need-grid {
      grid-template-columns: 1fr;
    }

    .lineup-row {
      grid-template-columns: 48px minmax(0, 1fr);
    }

    .player-meta {
      grid-column: 2;
    }
  }
</style>

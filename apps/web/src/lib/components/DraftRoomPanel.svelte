<script lang="ts">
  import type { DraftState, Position } from "../types";
  import {
    buildDraftBoardRows,
    currentDraftRound,
    visibleDraftRounds,
    type DraftBoardView,
  } from "../draft-board";
  import Icon from "./Icon.svelte";

  let { state: draftState }: { state: DraftState } = $props();

  let view: DraftBoardView = $state("live");
  let boardScroller: HTMLDivElement;

  const teams = $derived([...draftState.teams].sort((a, b) => a.draftSlot - b.draftSlot));
  const visibleRounds = $derived(visibleDraftRounds(draftState, view));
  const rows = $derived(buildDraftBoardRows(draftState, visibleRounds));
  const round = $derived(currentDraftRound(draftState));
  const totalPicks = $derived(draftState.settings.teams * draftState.settings.rounds);
  const completedPicks = $derived(draftState.picks.length);
  const completion = $derived(totalPicks > 0 ? Math.min(100, Math.round((completedPicks / totalPicks) * 100)) : 0);
  const boardEyebrow = $derived(
    draftState.status === "pre_draft"
      ? "Pre-draft board"
      : draftState.status === "complete"
        ? "Draft results"
        : "Live draft board",
  );

  $effect(() => {
    draftState.currentPick;
    view;
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const currentCell = boardScroller?.querySelector<HTMLElement>('[data-current="true"]');
      const userHeader = boardScroller?.querySelector<HTMLElement>('[data-user-slot="true"]');
      const target = currentCell ?? userHeader;
      if (!target || !boardScroller) {
        return;
      }

      boardScroller.scrollTo({
        left: Math.max(0, target.offsetLeft - boardScroller.clientWidth / 2 + target.clientWidth / 2),
        behavior: "smooth",
      });
    });
  });

  function positionClass(position: Position | undefined): string {
    return position ? `position-${position.toLowerCase()}` : "";
  }

  function shortTeamName(name: string): string {
    const compact = name.trim().replace(/\s+/g, " ");
    return compact.length <= 18 ? compact : `${compact.slice(0, 17)}...`;
  }
</script>

<section class="draft-room" aria-label="Draft room">
  <header class="room-header">
    <div class="room-title">
      <p class="eyebrow">{boardEyebrow}</p>
      <h2><Icon name="grid" size={19} /> Draft room</h2>
      <p>
        {#if draftState.status === "pre_draft"}
          Board ready for {draftState.settings.teams} teams and {draftState.settings.rounds} rounds.
        {:else if draftState.status === "complete"}
          {completedPicks} selections recorded. Review the completed room by team or round.
        {:else}
          Round {round} in progress. Pick {draftState.currentPick} of {totalPicks}.
        {/if}
      </p>
    </div>

    <div class="room-actions">
      <div class="view-control" role="tablist" aria-label="Draft board range">
        <button
          type="button"
          role="tab"
          aria-selected={view === "live"}
          class:active={view === "live"}
          onclick={() => (view = "live")}
        >
          {draftState.status === "complete" ? "Recent rounds" : "Live rounds"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "full"}
          class:active={view === "full"}
          onclick={() => (view = "full")}
        >
          Full board
        </button>
      </div>
    </div>
  </header>

  <div class="progress-row">
    <span style={`width:${completion}%`}></span>
  </div>

  <div class="board-scroller" bind:this={boardScroller}>
    <div class="board" style={`--team-count:${draftState.settings.teams}`}>
      <div class="corner-cell">
        <span>Round</span>
      </div>
      {#each teams as team (team.id)}
        <div class="team-header" class:user-team={team.id === draftState.userTeamId} data-user-slot={team.id === draftState.userTeamId}>
          <span>{team.draftSlot}</span>
          <strong title={team.name}>{shortTeamName(team.name)}</strong>
          {#if team.id === draftState.userTeamId}<small>Your team</small>{/if}
        </div>
      {/each}

      {#each rows as boardRow (boardRow.round)}
        <div class="round-cell">
          <strong>{boardRow.round}</strong>
          <span>{boardRow.direction === "forward" ? "left to right" : "right to left"}</span>
        </div>
        {#each boardRow.cells as cell (cell.pickNo)}
          <div
            class={`pick-cell ${positionClass(cell.player?.position)}`}
            class:filled={Boolean(cell.pick)}
            class:current={cell.isCurrent}
            class:user-pick={cell.isUserPick}
            class:user-slot={cell.isUserSlot}
            class:traded={cell.isTraded}
            data-current={cell.isCurrent}
          >
            <div class="pick-number">{boardRow.round}.{String(cell.pickNo - (boardRow.round - 1) * draftState.settings.teams).padStart(2, "0")} <span>#{cell.pickNo}</span></div>
            {#if cell.player}
              <strong title={cell.player.name}>{cell.player.name}</strong>
              <div class="player-meta">
                <span>{cell.player.position}</span>
                <small>{cell.player.team || "FA"}</small>
              </div>
              {#if cell.isTraded}
                <em title={cell.owner?.name}>via {cell.owner ? shortTeamName(cell.owner.name) : "traded pick"}</em>
              {/if}
            {:else if cell.isCurrent}
              <strong class="on-clock">On the clock</strong>
              <small>{cell.owner?.name ?? `Slot ${cell.draftSlot}`}</small>
            {:else}
              <span class="empty-pick">{cell.owner?.name ?? `Slot ${cell.draftSlot}`}</span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
  </div>

  <footer class="room-legend">
    <span><i class="legend-user"></i>Your picks</span>
    <span><i class="legend-current"></i>On the clock</span>
    <span><i class="legend-traded"></i>Traded pick</span>
    <span class="scroll-hint">Scroll horizontally to inspect every team</span>
  </footer>
</section>

<style>
  .draft-room {
    min-width: 0;
    margin-top: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .room-header {
    display: flex;
    justify-content: space-between;
    gap: var(--space-5);
    align-items: flex-start;
    padding: 18px 20px 15px;
  }

  .room-title h2 {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: var(--text-xl);
  }

  .room-title > p:last-child {
    margin-top: 5px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .room-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .view-control {
    display: inline-grid;
    grid-template-columns: repeat(2, auto);
    gap: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 3px;
  }

  .view-control button {
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 7px 10px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    cursor: pointer;
  }

  .view-control button.active {
    background: var(--surface-raised);
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
  }

  .progress-row {
    height: 3px;
    background: var(--surface-sunken);
  }

  .progress-row span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width var(--transition-base);
  }

  .board-scroller {
    min-width: 0;
    max-height: 620px;
    overflow: auto;
    overscroll-behavior: contain;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: var(--surface-sunken);
  }

  .board {
    display: grid;
    grid-template-columns: 70px repeat(var(--team-count), minmax(118px, 1fr));
    min-width: calc(70px + var(--team-count) * 118px);
  }

  .corner-cell,
  .team-header {
    position: sticky;
    top: 0;
    z-index: 3;
    min-height: 58px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border-strong);
    background: #181c22;
  }

  .corner-cell {
    left: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    text-transform: uppercase;
  }

  .team-header {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    column-gap: 6px;
    align-content: center;
    padding: 9px 10px;
  }

  .team-header > span {
    grid-row: 1 / 3;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
  }

  .team-header strong {
    overflow: hidden;
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-header small {
    color: var(--accent);
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .team-header.user-team {
    background: #14251f;
  }

  .round-cell {
    position: sticky;
    left: 0;
    z-index: 2;
    display: grid;
    align-content: center;
    justify-items: center;
    min-height: 96px;
    border-right: 1px solid var(--border-strong);
    border-bottom: 1px solid var(--border);
    background: #181c22;
  }

  .round-cell strong {
    font-size: var(--text-lg);
  }

  .round-cell span {
    color: var(--text-muted);
    font-size: 8px;
    text-transform: uppercase;
    writing-mode: vertical-rl;
  }

  .pick-cell {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(30px, auto) auto;
    align-content: start;
    min-width: 0;
    min-height: 96px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 8px 9px;
    background: #101318;
    overflow: hidden;
  }

  .pick-cell.user-slot {
    background: rgba(52, 211, 153, 0.035);
  }

  .pick-cell.filled::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--position-color, var(--border-strong));
    content: "";
  }

  .pick-cell.user-pick {
    background: #12261f;
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }

  .pick-cell.current {
    z-index: 1;
    background: #2a2112;
    box-shadow: inset 0 0 0 2px var(--warning);
  }

  .pick-cell.traded {
    background-image: linear-gradient(135deg, transparent 82%, rgba(139, 155, 248, 0.18) 82%);
  }

  .pick-number {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .pick-cell > strong {
    align-self: center;
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-sm);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-cell > strong.on-clock {
    color: var(--warning);
  }

  .player-meta {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .player-meta span {
    border-radius: 3px;
    background: color-mix(in srgb, var(--position-color) 18%, transparent);
    padding: 2px 5px;
    color: var(--position-color);
    font-size: 9px;
    font-weight: 900;
  }

  .player-meta small,
  .pick-cell > small,
  .empty-pick {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-cell em {
    overflow: hidden;
    color: var(--info);
    font-size: 8px;
    font-style: normal;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-pick {
    align-self: center;
  }

  .position-qb { --position-color: #f5b544; }
  .position-rb { --position-color: #34d399; }
  .position-wr { --position-color: #38bdf8; }
  .position-te { --position-color: #a78bfa; }
  .position-k { --position-color: #f472b6; }
  .position-def { --position-color: #94a3b8; }

  .room-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    padding: 11px 20px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .room-legend span {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .room-legend i {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }

  .legend-user { background: var(--accent); }
  .legend-current { background: var(--warning); }
  .legend-traded { background: var(--info); }

  .room-legend .scroll-hint {
    margin-left: auto;
  }

  @media (max-width: 720px) {
    .room-header {
      display: grid;
      padding: 16px;
    }

    .room-actions {
      justify-content: space-between;
    }

    .board-scroller {
      max-height: 540px;
    }

    .room-legend {
      padding-inline: 16px;
    }

    .room-legend .scroll-hint {
      width: 100%;
      margin-left: 0;
    }
  }
</style>

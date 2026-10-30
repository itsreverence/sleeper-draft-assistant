<script lang="ts">
  import type { DraftState, Position } from "../types";
  import {
    buildDraftBoardRows,
    visibleDraftRounds,
    type DraftBoardView,
  } from "../draft-board";
  import Icon from "./Icon.svelte";

  let {
    state: draftState,
    onSelectTeam,
  }: {
    state: DraftState;
    onSelectTeam?: (teamId: string) => void;
  } = $props();

  let view: DraftBoardView = $state("live");
  let boardScroller: HTMLDivElement;

  const teams = $derived([...draftState.teams].sort((a, b) => a.draftSlot - b.draftSlot));
  const visibleRounds = $derived(visibleDraftRounds(draftState, view));
  const rows = $derived(buildDraftBoardRows(draftState, visibleRounds));

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

<section class="draft-room" aria-label="Draft board">
  <header class="room-legend">
    <h2>Board · {view === "live" ? "live view" : "full view"}</h2>
    <div class="legend-group">
      <span><i class="legend-user"></i>Your picks</span>
      <span><i class="legend-current"></i>Current pick</span>
      <span><i class="legend-traded"></i>Traded pick</span>
      <button
        class="view-action"
        type="button"
        aria-pressed={view === "full"}
        aria-label={view === "live" ? "Show full draft board" : "Return to live draft view"}
        title={view === "live" ? "Show full draft board" : "Return to live draft view"}
        onclick={() => (view = view === "live" ? "full" : "live")}
      >
        <Icon name={view === "live" ? "expand" : "collapse"} size={14} />
        <span>{view === "live" ? "Full board" : "Live view"}</span>
      </button>
    </div>
  </header>

  <div class="board-scroller" bind:this={boardScroller}>
    <div class="board" role="table" aria-label="Draft picks by round and team" style={`--team-count:${draftState.settings.teams}`}>
      <div class="board-group" role="rowgroup">
        <div class="board-group" role="row">
          <div class="corner-cell" role="columnheader">
            <span>Round</span>
          </div>
          {#each teams as team (team.id)}
            <div class="board-group" role="columnheader">
              <button
                class="team-header"
                class:user-team={team.id === draftState.userTeamId}
                data-user-slot={team.id === draftState.userTeamId}
                type="button"
                title={`View ${team.name} roster`}
                onclick={() => onSelectTeam?.(team.id)}
              >
                <span>{team.draftSlot}</span>
                <strong>{team.name}</strong>
                {#if team.id === draftState.userTeamId}<small>Your team</small>{/if}
              </button>
            </div>
          {/each}
        </div>
      </div>

      <div class="board-group" role="rowgroup">
        {#each rows as boardRow (boardRow.round)}
          <div class="board-group" role="row">
            <div
              class="round-cell"
              class:reverse={boardRow.direction === "reverse"}
              role="rowheader"
              title={boardRow.direction ? `Round ${boardRow.round}: ${boardRow.direction === "forward" ? "left to right" : "right to left"}` : `Round ${boardRow.round}`}
            >
              <strong><span class="sr-only">{"Round "}</span>{boardRow.round}</strong>
              {#if boardRow.direction}
                <span class="direction-icon">
                  <Icon name={boardRow.direction === "forward" ? "arrow-right" : "arrow-left"} size={15} />
                </span>
                <span class="sr-only">{boardRow.direction === "forward" ? "Left to right" : "Right to left"}</span>
              {/if}
            </div>
            {#each boardRow.cells as cell (cell.pickNo)}
              <div
                class={`pick-cell ${positionClass(cell.player?.position)}`}
                class:filled={Boolean(cell.pick)}
                class:current={cell.isCurrent}
                class:user-next={cell.isUserNext && !cell.isCurrent}
                class:user-pick={cell.isUserPick}
                class:user-slot={cell.isUserOwned}
                class:traded={cell.isTraded}
                role="cell"
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
                  {:else if cell.owner}
                    <span class="sr-only">{cell.owner.name}</span>
                  {/if}
                {:else if cell.isCurrent}
                  <strong class="now">Now</strong>
                  <small>{cell.owner?.name ?? `Slot ${cell.draftSlot}`}</small>
                  {#if cell.isTraded}<em>Traded</em>{/if}
                {:else if cell.isUserNext}
                  <strong class="your-pick">Your pick</strong>
                  <small>{cell.owner?.name ?? `Slot ${cell.draftSlot}`}</small>
                  {#if cell.isTraded}<em>Traded</em>{/if}
                {:else}
                  <span class="empty-pick">{cell.owner?.name ?? `Slot ${cell.draftSlot}`}</span>
                  {#if cell.isTraded}<em>Traded</em>{/if}
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

</section>

<style>
  .draft-room {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .board-scroller {
    min-width: 0;
    overflow-x: auto;
    overflow-y: visible;
    overscroll-behavior-x: contain;
    background: var(--surface-sunken);
  }

  .board {
    display: grid;
    grid-template-columns: 70px repeat(var(--team-count), minmax(118px, 1fr));
    min-width: calc(70px + var(--team-count) * 118px);
  }

  /* Table roles sit on wrappers; the cells stay direct items of the board grid so the sticky header and round column keep working. */
  .board-group {
    display: contents;
  }

  .corner-cell,
  .team-header {
    position: sticky;
    top: 0;
    z-index: 3;
    min-height: 44px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border-strong);
    background: var(--board-head);
  }

  .corner-cell {
    left: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .team-header {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    column-gap: 6px;
    align-content: center;
    padding: 6px 10px;
    border-top: 0;
    border-left: 0;
    border-radius: 0;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .team-header:hover,
  .team-header:focus-visible {
    background: var(--surface-hover);
  }

  .team-header:focus-visible {
    z-index: 4;
    outline: 2px solid var(--accent);
    outline-offset: -2px;
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
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .team-header strong {
    overflow: hidden;
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-header small {
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .team-header.user-team {
    background: var(--board-user);
  }

  .round-cell {
    position: sticky;
    left: 0;
    z-index: 2;
    display: grid;
    align-content: center;
    justify-items: center;
    min-height: 72px;
    border-right: 1px solid var(--border-strong);
    border-bottom: 1px solid var(--border);
    background: var(--board-head);
  }

  .round-cell strong {
    font-size: var(--text-lg);
  }

  .direction-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 18px;
    color: var(--text-secondary);
    opacity: 0.9;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .round-cell.reverse .direction-icon {
    color: var(--info);
  }

  /* The text label remains available to assistive technology; the icon carries the visual scan. */
  .round-cell span {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .pick-cell {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(20px, auto) auto;
    align-content: start;
    min-width: 0;
    min-height: 72px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 6px 9px;
    background: var(--board-cell);
    overflow: hidden;
  }

  .pick-cell.user-slot {
    background: rgba(52, 211, 153, 0.035);
  }

  .pick-cell.user-pick {
    background: var(--board-user-pick);
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .pick-cell.user-pick .pick-number {
    color: var(--accent);
  }

  .pick-cell.user-pick > strong {
    color: var(--text-primary);
  }

  .pick-cell.traded {
    background-image: linear-gradient(135deg, transparent 78%, color-mix(in srgb, var(--info) 38%, transparent) 78%);
    box-shadow: inset 0 0 0 1px var(--info);
  }

  .pick-cell.user-pick.traded {
    box-shadow: inset 0 0 0 1px var(--info), inset 0 0 0 3px rgba(52, 211, 153, 0.2);
  }

  .pick-cell.filled::before {
    position: absolute;
    inset: 0 0 auto;
    height: 2px;
    background: var(--position-color, var(--border-strong));
    content: "";
  }

  .pick-cell.current {
    z-index: 1;
    background: var(--board-current);
    box-shadow: inset 0 0 0 2px var(--warning);
  }

  .pick-number {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
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

  .pick-cell > strong.now {
    color: var(--warning);
  }

  .pick-cell.user-next {
    background: var(--board-user);
  }

  .pick-cell > strong.your-pick {
    color: var(--accent);
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
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .player-meta small,
  .pick-cell > small,
  .empty-pick {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-cell em {
    overflow: hidden;
    color: var(--info);
    font-size: var(--text-xs);
    font-style: normal;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-pick {
    align-self: center;
  }

  .position-qb { --position-color: var(--pos-qb); }
  .position-rb { --position-color: var(--pos-rb); }
  .position-wr { --position-color: var(--pos-wr); }
  .position-te { --position-color: var(--pos-te); }
  .position-k { --position-color: var(--pos-k); }
  .position-def { --position-color: var(--pos-def); }

  .room-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2) var(--space-5);
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding: var(--space-3) var(--space-5);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .room-legend h2 {
    color: var(--text-primary);
    font-size: var(--text-lg);
  }

  .legend-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) 14px;
  }

  .legend-group span {
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

  .view-action {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 6px 9px;
    color: var(--text-secondary);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .view-action:hover {
    border-color: var(--border-strong);
    background: var(--surface-hover);
    color: var(--accent);
  }

  .view-action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  @media (max-width: 760px) {
    .room-legend {
      padding-inline: var(--space-4);
    }
  }
</style>

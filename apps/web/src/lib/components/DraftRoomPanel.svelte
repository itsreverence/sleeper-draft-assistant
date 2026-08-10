<script lang="ts">
  import type { DraftState, Position } from "../types";
  import {
    buildDraftBoardRows,
    visibleDraftRounds,
    type DraftBoardView,
  } from "../draft-board";
  import { isUserOnTheClock, picksUntilUserTurn } from "../format";
  import Icon from "./Icon.svelte";
  import DraftSyncStatus from "./DraftSyncStatus.svelte";

  let {
    state: draftState,
    onSelectTeam,
    draftLastSuccessfulAt = null,
    draftConsecutiveFailures = 0,
    draftNextRetryMs = 0,
    draftReconnecting = false,
    onReconnectDraft,
  }: {
    state: DraftState;
    onSelectTeam?: (teamId: string) => void;
    draftLastSuccessfulAt?: number | null;
    draftConsecutiveFailures?: number;
    draftNextRetryMs?: number;
    draftReconnecting?: boolean;
    onReconnectDraft?: () => void;
  } = $props();

  let view: DraftBoardView = $state("live");
  let boardScroller: HTMLDivElement;

  const teams = $derived([...draftState.teams].sort((a, b) => a.draftSlot - b.draftSlot));
  const visibleRounds = $derived(visibleDraftRounds(draftState, view));
  const rows = $derived(buildDraftBoardRows(draftState, visibleRounds));
  const picksAway = $derived(picksUntilUserTurn(draftState));
  const onTheClock = $derived(isUserOnTheClock(draftState));
  const syncDegraded = $derived(draftConsecutiveFailures > 0 || draftReconnecting);
  const contextLabel = $derived.by(() => {
    if (draftState.status === "complete") return "Draft complete";
    if (draftState.status === "pre_draft") return null;
    if (onTheClock) return "Your turn";
    if (picksAway === null) return "Pick timing unknown";
    if (picksAway === 1) return "1 pick away";
    return `${picksAway} picks away`;
  });
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
  {#if contextLabel || syncDegraded}
    <header class="room-header" aria-label="Draft state">
      <div class="room-meta">
        {#if contextLabel}
          <span class="context-state" class:on-clock={onTheClock}>{contextLabel}</span>
        {/if}
        {#if syncDegraded}
          <DraftSyncStatus lastSuccessfulAt={draftLastSuccessfulAt} consecutiveFailures={draftConsecutiveFailures} nextRetryMs={draftNextRetryMs} reconnecting={draftReconnecting} onReconnect={onReconnectDraft} />
        {/if}
      </div>
    </header>
  {/if}

  <div class="board-scroller" bind:this={boardScroller}>
    <div class="board" style={`--team-count:${draftState.settings.teams}`}>
      <div class="corner-cell">
        <span>Round</span>
      </div>
      {#each teams as team (team.id)}
        <button
          class="team-header"
          class:user-team={team.id === draftState.userTeamId}
          data-user-slot={team.id === draftState.userTeamId}
          type="button"
          title={`View ${team.name} roster`}
          onclick={() => onSelectTeam?.(team.id)}
        >
          <span>{team.draftSlot}</span>
          <strong title={team.name}>{shortTeamName(team.name)}</strong>
          {#if team.id === draftState.userTeamId}<small>Your team</small>{/if}
        </button>
      {/each}

      {#each rows as boardRow (boardRow.round)}
        <div class="round-cell" title={`Round ${boardRow.round}: ${boardRow.direction === "forward" ? "left to right" : "right to left"}`}>
          <strong>{boardRow.round}</strong>
          <span class="direction-icon">
            <Icon name={boardRow.direction === "forward" ? "arrow-right" : "arrow-left"} size={15} />
          </span>
          <span class="direction-label">{boardRow.direction === "forward" ? "Left to right" : "Right to left"}</span>
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
    <div class="legend-group">
      <span><i class="legend-user"></i>Your picks</span>
      <span><i class="legend-current"></i>On the clock</span>
      <span><i class="legend-traded"></i>Traded pick</span>
    </div>
    <div class="footer-actions">
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
    justify-content: flex-start;
    padding: 10px 20px 0;
  }

  .room-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 8px 12px;
    min-width: 0;
  }

  .context-state {
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    padding: 5px 8px;
    color: var(--text-secondary);
    font-weight: 800;
  }

  .context-state.on-clock {
    border-color: var(--warning-border);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .board-scroller {
    min-width: 0;
    overflow-x: auto;
    overflow-y: visible;
    overscroll-behavior-x: contain;
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
    font-size: var(--text-xs);
    font-weight: 900;
    text-transform: uppercase;
  }

  .team-header {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    column-gap: 6px;
    align-content: center;
    padding: 9px 10px;
    border-top: 0;
    border-left: 0;
    border-radius: 0;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .team-header:hover,
  .team-header:focus-visible {
    background: #20262d;
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
    font-size: var(--text-xs);
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

  .direction-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 18px;
    color: var(--text-secondary);
    opacity: 0.9;
  }

  .direction-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .round-cell[title*="right to left"] .direction-icon {
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

  .pick-cell.user-pick {
    background: #17382d;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .pick-cell.user-pick .pick-number {
    color: var(--accent);
  }

  .pick-cell.user-pick > strong {
    color: #ecfff7;
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
    background: #2a2112;
    box-shadow: inset 0 0 0 2px var(--warning);
  }

  .pick-number {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--text-xs);
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
    font-size: var(--text-xs);
    font-weight: 900;
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

  .position-qb { --position-color: #f5b544; }
  .position-rb { --position-color: #34d399; }
  .position-wr { --position-color: #38bdf8; }
  .position-te { --position-color: #a78bfa; }
  .position-k { --position-color: #f472b6; }
  .position-def { --position-color: #94a3b8; }

  .room-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px 20px;
    align-items: center;
    padding: 11px 20px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .legend-group,
  .footer-actions {
    display: inline-flex;
    align-items: center;
  }

  .legend-group { gap: 14px; }
  .footer-actions {
    justify-content: flex-end;
    gap: 10px 16px;
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
    font-weight: 800;
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

  @media (max-width: 720px) {
    .room-header {
      padding: 10px 16px 0;
    }

    .room-meta {
      justify-content: flex-start;
    }

    .room-legend {
      padding-inline: 16px;
    }

    .legend-group,
    .footer-actions {
      width: 100%;
      margin-left: 0;
    }

    .footer-actions {
      justify-content: flex-end;
    }
  }
</style>

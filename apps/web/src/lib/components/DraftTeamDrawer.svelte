<script lang="ts">
  import type { DraftState, Position } from "../types";
  import { pickNumberForDraftSlot } from "../draft-board";
  import Drawer from "./Drawer.svelte";
  import Icon from "./Icon.svelte";

  let {
    state,
    teamId,
    onClose,
    onAsk,
  }: {
    state: DraftState;
    teamId: string;
    onClose: () => void;
    onAsk?: (teamId: string) => void;
  } = $props();

  const positionOrder: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const team = $derived(state.teams.find((candidate) => candidate.id === teamId) ?? null);
  const playersById = $derived(new Map(state.players.map((player) => [player.id, player])));
  const selections = $derived(
    state.picks
      .filter((pick) => pick.teamId === teamId)
      .sort((a, b) => a.pickNo - b.pickNo)
      .flatMap((pick) => {
        const player = playersById.get(pick.playerId);
        return player ? [{ pick, player }] : [];
      }),
  );
  const positionCounts = $derived.by(() => {
    const counts = Object.fromEntries(positionOrder.map((position) => [position, 0])) as Record<Position, number>;
    for (const selection of selections) {
      counts[selection.player.position] += 1;
    }
    return counts;
  });
  const nextScheduledPick = $derived.by(() => {
    if (!team || state.status === "complete") {
      return null;
    }
    for (let round = 1; round <= state.settings.rounds; round += 1) {
      const pickNo = pickNumberForDraftSlot(round, team.draftSlot, state.settings.teams);
      if (pickNo >= state.currentPick) {
        return pickNo;
      }
    }
    return null;
  });

</script>

<Drawer
  label={`${team?.name ?? "Team"} roster`}
  closeLabel="Close team roster"
  eyebrow={team ? `Draft slot ${team.draftSlot}` : undefined}
  title={team?.name ?? "Team roster"}
  icon="users"
  subtitle={team ? `${selections.length}/${state.settings.rounds} players drafted${nextScheduledPick ? ` · next scheduled at #${nextScheduledPick}` : ""}` : undefined}
  {onClose}
>
  {#snippet badge()}
    {#if team?.id === state.userTeamId}<span class="pill pill-ready">Your team</span>{/if}
  {/snippet}

  {#if team}
    <div class="position-summary" aria-label="Roster position counts">
      {#each positionOrder as position}
        <span class:empty={positionCounts[position] === 0}>{position} <strong>{positionCounts[position]}</strong></span>
      {/each}
    </div>

    <section class="roster-section">
      <h3>Selections</h3>
      {#if selections.length > 0}
        <ol>
          {#each selections as selection}
            <li>
              <span>#{selection.pick.pickNo}</span>
              <div>
                <strong>{selection.player.name}</strong>
                <small>{selection.player.position} · {selection.player.team || "FA"}</small>
              </div>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="empty-roster">No players drafted by this team yet.</p>
      {/if}
    </section>

    {#if onAsk && team.id !== state.userTeamId}
      <button class="ask-team" type="button" onclick={() => onAsk?.(team.id)}>
        <Icon name="message" size={14} />
        Ask Assistant how this team affects my next pick
      </button>
    {/if}
  {/if}
</Drawer>

<style>
  .empty-roster {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .position-summary {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    border-block: 1px solid var(--border);
  }

  .position-summary span {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 9px 4px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .position-summary span + span {
    border-left: 1px solid var(--border);
  }

  .position-summary span.empty {
    color: var(--text-muted);
  }

  .position-summary strong {
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .roster-section {
    display: grid;
    gap: 10px;
  }

  .roster-section h3 {
    font-size: var(--text-sm);
  }

  .roster-section ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .roster-section li {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    border-top: 1px solid var(--border);
    padding: 10px 2px;
  }

  .roster-section li > span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .roster-section li > div {
    display: grid;
    gap: 2px;
  }

  .roster-section li strong {
    font-size: var(--text-sm);
  }

  .roster-section li small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .ask-team {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    padding: 10px 12px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
  }
</style>

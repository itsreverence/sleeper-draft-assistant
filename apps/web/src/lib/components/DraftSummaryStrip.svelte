<script lang="ts">
  import type { DraftState } from "../types";
  import { getUserTeam, isUserOnTheClock, picksUntilUserTurn } from "../format";

  let { state }: { state: DraftState } = $props();

  const userTeam = $derived(getUserTeam(state));
  const picksAway = $derived(picksUntilUserTurn(state));
  const onTheClock = $derived(isUserOnTheClock(state));
  const rosteredCount = $derived(userTeam?.roster.length ?? 0);
  const urgencyLabel = $derived.by(() => {
    if (state.status === "complete") {
      return "Draft complete - manage your season";
    }
    if (state.status === "pre_draft") {
      return "Draft hasn't started - prep rankings and board";
    }
    if (onTheClock) {
      return "You're on the clock";
    }
    if (picksAway === null) {
      return "Pick timing unknown";
    }
    if (picksAway === 1) {
      return "1 pick away";
    }
    return `${picksAway} picks away`;
  });
</script>

<section
  class="draft-strip"
  class:on-clock={onTheClock}
  class:complete={state.status === "complete"}
  class:pre-draft={state.status === "pre_draft"}
  aria-label="Draft summary"
>
  <div class="urgency">
    <span>{state.status === "complete" ? "Season" : "Your turn"}</span>
    <strong>{urgencyLabel}</strong>
  </div>
  {#if state.status === "complete"}
    <div>
      <span>Your roster</span>
      <strong>{rosteredCount} players</strong>
    </div>
    <div>
      <span>Your slot</span>
      <strong>{userTeam?.draftSlot ?? "-"}</strong>
    </div>
    <div>
      <span>Format</span>
      <strong>{state.settings.scoring}</strong>
    </div>
  {:else}
    <div>
      <span>Current pick</span>
      <strong>{state.currentPick}</strong>
    </div>
    <div>
      <span>Your slot</span>
      <strong>{userTeam?.draftSlot ?? "-"}</strong>
    </div>
    <div>
      <span>Format</span>
      <strong>{state.settings.scoring}</strong>
    </div>
  {/if}
</section>

<style>
  .draft-strip {
    display: grid;
    grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    overflow: hidden;
  }

  .draft-strip.on-clock {
    border-color: var(--accent-border);
    background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface-raised));
  }

  .draft-strip.complete {
    border-color: var(--info-border);
    background: color-mix(in srgb, var(--info-soft) 45%, var(--surface-raised));
  }

  .draft-strip.pre-draft {
    border-color: var(--border-strong);
  }

  .draft-strip div {
    padding: 15px 18px;
    border-right: 1px solid var(--border);
  }

  .draft-strip div:last-child {
    border-right: 0;
  }

  .draft-strip span {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .draft-strip strong {
    display: block;
    margin-top: 3px;
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
  }

  .urgency strong {
    color: var(--text-primary);
    font-size: var(--text-lg);
    line-height: 1.25;
  }

  .on-clock .urgency strong {
    color: var(--accent);
  }

  .complete .urgency strong {
    color: var(--info);
  }

  @media (max-width: 720px) {
    .draft-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .draft-strip div:nth-child(2) {
      border-right: 0;
    }

    .draft-strip div:nth-child(3),
    .draft-strip div:nth-child(4) {
      border-top: 1px solid var(--border);
    }

    .urgency {
      grid-column: 1 / -1;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
  }
</style>

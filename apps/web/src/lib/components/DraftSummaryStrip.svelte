<script lang="ts">
  import type { DraftState } from "../types";
  import { getUserTeam } from "../format";

  let { state }: { state: DraftState } = $props();

  const userTeam = $derived(getUserTeam(state));
</script>

<section class="draft-strip" aria-label="Draft summary">
  <div>
    <span>Current pick</span>
    <strong>{state.currentPick}</strong>
  </div>
  <div>
    <span>Format</span>
    <strong>{state.settings.scoring}</strong>
  </div>
  <div>
    <span>Your slot</span>
    <strong>{userTeam?.draftSlot ?? "-"}</strong>
  </div>
  <div>
    <span>Status</span>
    <strong class="status-value">{state.status.replace("_", " ")}</strong>
  </div>
</section>

<style>
  .draft-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
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
    text-transform: capitalize;
  }

  .status-value {
    color: var(--accent);
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
  }
</style>

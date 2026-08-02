<script lang="ts">
  import type { DraftPhase, WorkspaceMode } from "../format";

  let {
    mode = $bindable("draft"),
    manageAvailable = false,
    phase = null,
    onUserSelect,
  }: {
    mode?: WorkspaceMode;
    manageAvailable?: boolean;
    phase?: DraftPhase | null;
    onUserSelect?: () => void;
  } = $props();

  const draftLabel = $derived(
    phase === "complete" ? "Draft review" : phase === "pre_draft" ? "Draft prep" : "Draft room",
  );
  const manageLabel = $derived(phase === "complete" ? "Season" : "Team manager");
  const manageTitle = $derived(
    manageAvailable
      ? phase === "complete"
        ? "Lineups, waivers, and weekly decisions"
        : "Season team manager"
      : "Open a real Sleeper league to manage your team",
  );

  function select(next: WorkspaceMode) {
    if (next === "manage" && !manageAvailable) {
      return;
    }
    onUserSelect?.();
    mode = next;
  }
</script>

<div class="mode-tabs" role="tablist" aria-label="Workspace mode">
  <button
    class="mode-tab"
    class:active={mode === "draft"}
    type="button"
    role="tab"
    aria-selected={mode === "draft"}
    onclick={() => select("draft")}
  >
    {draftLabel}
  </button>
  <button
    class="mode-tab"
    class:active={mode === "manage"}
    type="button"
    role="tab"
    aria-selected={mode === "manage"}
    disabled={!manageAvailable}
    title={manageTitle}
    onclick={() => select("manage")}
  >
    {manageLabel}
  </button>
</div>

<style>
  .mode-tabs {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    width: fit-content;
    max-width: 100%;
  }

  .mode-tab {
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 700;
    padding: 8px 14px;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .mode-tab:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .mode-tab.active {
    background: var(--surface-raised);
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
  }

  .mode-tab:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
</style>

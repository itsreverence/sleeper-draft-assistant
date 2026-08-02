<script lang="ts">
  import type { WorkspaceMode } from "../format";

  let {
    mode = $bindable("draft"),
    manageAvailable = false,
    onUserSelect,
  }: {
    mode?: WorkspaceMode;
    manageAvailable?: boolean;
    onUserSelect?: () => void;
  } = $props();

  const manageTitle = $derived(
    manageAvailable
      ? "Lineups, waivers, and weekly decisions"
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
    Draft
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
    Team manager
  </button>
</div>

<style>
  .mode-tabs {
    display: inline-flex;
    gap: 24px;
    width: fit-content;
    max-width: 100%;
    border-bottom: 1px solid var(--border);
  }

  .mode-tab {
    position: relative;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 700;
    padding: 9px 2px 10px;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .mode-tab::after {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 2px;
    background: transparent;
    content: "";
    transition: background var(--transition-fast);
  }

  .mode-tab:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .mode-tab.active {
    color: var(--text-primary);
  }

  .mode-tab.active::after {
    background: var(--accent);
  }

  .mode-tab:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
</style>

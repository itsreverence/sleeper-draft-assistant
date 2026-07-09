<script lang="ts">
  export type WorkspaceMode = "draft" | "manage";

  let {
    mode = $bindable("draft"),
    manageAvailable = false,
  }: {
    mode?: WorkspaceMode;
    manageAvailable?: boolean;
  } = $props();
</script>

<div class="mode-tabs" role="tablist" aria-label="Workspace mode">
  <button
    class="mode-tab"
    class:active={mode === "draft"}
    type="button"
    role="tab"
    aria-selected={mode === "draft"}
    onclick={() => (mode = "draft")}
  >
    Draft room
  </button>
  <button
    class="mode-tab"
    class:active={mode === "manage"}
    type="button"
    role="tab"
    aria-selected={mode === "manage"}
    disabled={!manageAvailable}
    title={manageAvailable ? "Season team manager" : "Open a real Sleeper league to manage your team"}
    onclick={() => {
      if (manageAvailable) {
        mode = "manage";
      }
    }}
  >
    Team manager
  </button>
</div>

<style>
  .mode-tabs {
    display: inline-flex;
    gap: 4px;
    margin: var(--space-4) 0 0;
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

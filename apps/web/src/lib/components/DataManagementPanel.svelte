<script lang="ts">
  import { onMount } from "svelte";

  import { clearLocalDataCategory, fetchStorageInventory, fetchSupportReport, resetLocalData } from "../api";
  import type { LocalDataCategory, StorageInventory } from "../types";
  import Icon from "./Icon.svelte";

  let { onResetComplete }: { onResetComplete: () => void } = $props();

  let inventory: StorageInventory | null = $state(null);
  let error = $state("");
  let status = $state("");
  let pendingCategory: LocalDataCategory | null = $state(null);
  let busyAction = $state("");
  let resetOpen = $state(false);
  let resetConfirmation = $state("");

  const rows: Array<{ category: LocalDataCategory; label: string; description: string; count: keyof StorageInventory }> = [
    { category: "rankings", label: "Draft rankings", description: "FantasyPros ranking imports saved by draft.", count: "rankingImports" },
    { category: "season-projections", label: "Season projections", description: "FantasyPros season projections saved by draft.", count: "seasonProjectionImports" },
    { category: "adp", label: "Draft ADP", description: "FantasyPros Sleeper ADP imports saved by draft.", count: "adpImports" },
    { category: "ros-rankings", label: "ROS rankings", description: "FantasyPros rest-of-season rankings saved by league and season.", count: "rosRankingImports" },
    { category: "weekly-projections", label: "Weekly projections", description: "FantasyPros projection imports saved by league and week.", count: "weeklyProjectionImports" },
    { category: "decision-history", label: "Decision history", description: "Local recommendation snapshots used for review.", count: "decisionSnapshots" },
  ];

  onMount(() => {
    void loadInventory();
  });

  async function loadInventory() {
    error = "";
    try {
      inventory = await fetchStorageInventory();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not load local data details.";
    }
  }

  async function clearCategory(category: LocalDataCategory) {
    busyAction = category;
    error = "";
    status = "";
    try {
      const result = await clearLocalDataCategory(category);
      inventory = result.inventory;
      pendingCategory = null;
      status = result.deleted > 0 ? `Cleared ${result.deleted.toLocaleString()} saved record${result.deleted === 1 ? "" : "s"}.` : "No saved records were found.";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not clear the selected local data.";
    } finally {
      busyAction = "";
    }
  }

  async function downloadSupportReport() {
    busyAction = "support-report";
    error = "";
    status = "";
    try {
      const report = await fetchSupportReport();
      const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sleeper-assistant-support-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      status = "Redacted support report downloaded.";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not create the support report.";
    } finally {
      busyAction = "";
    }
  }

  async function resetEverything() {
    if (resetConfirmation !== "DELETE") {
      return;
    }
    busyAction = "reset";
    error = "";
    status = "";
    try {
      await resetLocalData();
      onResetComplete();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not reset local app data.";
      busyAction = "";
    }
  }
</script>

<section class="data-section" aria-labelledby="local-data-heading">
  <div class="section-heading">
    <div>
      <h2 id="local-data-heading"><Icon name="database" size={17} /> Local data</h2>
      <p>Stored only on this device in {inventory?.location === "application-data" ? "the app data directory" : "the development data directory"}.</p>
    </div>
    <button class="btn btn-secondary" type="button" title="Download redacted diagnostics and decision metadata" disabled={busyAction !== ""} onclick={downloadSupportReport}>
      <Icon name="download" size={14} />
      {busyAction === "support-report" ? "Preparing" : "Support report"}
    </button>
  </div>

  {#if inventory}
    <div class="data-list">
      {#each rows as row}
        <div class="data-row">
          <div class="data-copy">
            <div class="data-title">
              <strong>{row.label}</strong>
              <span>{Number(inventory[row.count]).toLocaleString()}</span>
            </div>
            <p>{row.description}</p>
          </div>
          {#if pendingCategory === row.category}
            <div class="confirm-actions" aria-label={`Confirm clearing ${row.label}`}>
              <button class="btn btn-ghost" type="button" disabled={busyAction !== ""} onclick={() => (pendingCategory = null)}>Cancel</button>
              <button class="btn btn-danger" type="button" disabled={busyAction !== ""} onclick={() => clearCategory(row.category)}>
                {busyAction === row.category ? "Clearing" : "Confirm"}
              </button>
            </div>
          {:else}
            <button
              class="icon-button"
              type="button"
              title={`Clear all ${row.label.toLowerCase()}`}
              aria-label={`Clear all ${row.label.toLowerCase()}`}
              disabled={busyAction !== "" || Number(inventory[row.count]) === 0}
              onclick={() => (pendingCategory = row.category)}
            >
              <Icon name="trash" size={15} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {:else if !error}
    <p class="empty">Loading local data details...</p>
  {/if}

  <div class="reset-area">
    {#if resetOpen}
      <div class="reset-confirmation">
        <div>
          <strong>Delete all local app data?</strong>
          <p>This resets settings, imports, recommendation history, and local connection preferences. It cannot be undone.</p>
        </div>
        <label class="field">
          <span>Type DELETE to confirm</span>
          <input class="input" type="text" autocomplete="off" bind:value={resetConfirmation} />
        </label>
        <div class="reset-actions">
          <button class="btn btn-ghost" type="button" disabled={busyAction !== ""} onclick={() => { resetOpen = false; resetConfirmation = ""; }}>Cancel</button>
          <button class="btn btn-danger" type="button" disabled={busyAction !== "" || resetConfirmation !== "DELETE"} onclick={resetEverything}>
            {busyAction === "reset" ? "Deleting" : "Delete and restart"}
          </button>
        </div>
      </div>
    {:else}
      <button class="btn btn-ghost danger-link" type="button" disabled={busyAction !== ""} onclick={() => (resetOpen = true)}>
        Delete all local app data
      </button>
    {/if}
  </div>

  {#if error}
    <p class="callout callout-danger" role="alert"><Icon name="alert" size={15} />{error}</p>
  {/if}
  {#if status}
    <p class="settings-status" aria-live="polite">{status}</p>
  {/if}
</section>

<style>
  .data-section {
    display: grid;
    gap: var(--space-4);
    border-top: 1px solid var(--border);
    padding-top: var(--space-5);
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .section-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-lg);
  }

  .section-heading p,
  .data-copy p,
  .reset-confirmation p,
  .settings-status {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .section-heading p {
    margin-top: 4px;
  }

  .data-list {
    border-top: 1px solid var(--border);
  }

  .data-row {
    display: flex;
    min-height: 66px;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    border-bottom: 1px solid var(--border);
    padding: 11px 0;
  }

  .data-copy {
    min-width: 0;
  }

  .data-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .data-title span {
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .icon-button {
    display: inline-flex;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .icon-button:hover:not(:disabled) {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .confirm-actions,
  .reset-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-danger {
    border-color: var(--danger-border);
    background: var(--danger-strong);
    color: #fff;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--danger);
  }

  .reset-area {
    display: flex;
    justify-content: flex-start;
  }

  .danger-link {
    padding-inline: 0;
    color: var(--danger);
  }

  .reset-confirmation {
    display: grid;
    width: 100%;
    gap: var(--space-3);
    border: 1px solid var(--danger-border);
    border-radius: var(--radius-md);
    background: var(--danger-soft);
    padding: var(--space-4);
  }

  .reset-confirmation .field {
    max-width: 320px;
  }

  @media (max-width: 640px) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .section-heading .btn {
      width: 100%;
    }

    .icon-button {
      align-self: center;
    }

    .confirm-actions {
      justify-content: flex-end;
    }

    .reset-confirmation .input {
      font-size: 16px;
    }
  }
</style>

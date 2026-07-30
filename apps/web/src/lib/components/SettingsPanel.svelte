<script lang="ts">
  import Icon from "./Icon.svelte";
  import AiProviderForm from "./AiProviderForm.svelte";
  import DataManagementPanel from "./DataManagementPanel.svelte";
  import type { AiProviderStatus, AppSettings } from "../types";

  let {
    settings,
    providerStatus,
    isSaving,
    error,
    isCopyingDiagnostics,
    diagnosticsStatus,
    onSave,
    onCopyDiagnostics,
    onResetComplete,
    draftDataAvailable = false,
    draftDataStatus = "",
    onManageDraftData,
  }: {
    settings: AppSettings | null;
    providerStatus: AiProviderStatus | null;
    isSaving: boolean;
    error: string;
    isCopyingDiagnostics: boolean;
    diagnosticsStatus: string;
    onSave: (settings: AppSettings) => void;
    onCopyDiagnostics: () => void;
    onResetComplete: () => void;
    draftDataAvailable?: boolean;
    draftDataStatus?: string;
    onManageDraftData?: () => void;
  } = $props();

</script>

<section class="panel settings-panel" aria-label="Application settings">
  <div class="panel-heading">
    <div>
      <h2>AI provider</h2>
    </div>
    {#if providerStatus}
      <span class="pill" class:pill-ready={providerStatus.configured} class:pill-warning={providerStatus.experimental}>
        {providerStatus.label}
      </span>
    {/if}
  </div>

  <AiProviderForm
    {settings}
    {providerStatus}
    {isSaving}
    {error}
    submitLabel="Save settings"
    {onSave}
  />

  <div class="settings-actions">
    <button class="btn btn-secondary" type="button" disabled={isCopyingDiagnostics} onclick={onCopyDiagnostics}>
      <Icon name="clipboard" size={14} />
      {isCopyingDiagnostics ? "Copying" : "Copy diagnostics"}
    </button>
  </div>

  {#if diagnosticsStatus}
    <p class="settings-note">{diagnosticsStatus}</p>
  {/if}

  {#if draftDataAvailable && onManageDraftData}
    <div class="maintenance-group">
      <span class="maintenance-label">Draft workspace</span>
      <button class="maintenance-action" type="button" onclick={onManageDraftData}>
        <Icon name="upload" size={17} />
        <span>
          <strong>Manage draft data</strong>
          <small>{draftDataStatus} - Opens Draft preparation</small>
        </span>
        <Icon name="chevron-right" size={14} />
      </button>
    </div>
  {/if}

  <DataManagementPanel {onResetComplete} />
</section>

<style>
  .settings-panel {
    display: grid;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .settings-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .settings-note {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .maintenance-action {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 12px 13px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .maintenance-group {
    display: grid;
    gap: 7px;
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }

  .maintenance-label {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .maintenance-action:hover {
    border-color: var(--border-strong);
    background: var(--surface-raised);
  }

  .maintenance-action > :global(.icon) {
    color: var(--text-muted);
  }

  .maintenance-action span {
    display: grid;
    gap: 2px;
  }

  .maintenance-action strong {
    font-size: var(--text-sm);
  }

  .maintenance-action small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (max-width: 480px) {
    .settings-panel > .panel-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>

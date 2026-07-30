<script lang="ts">
  import Icon from "./Icon.svelte";
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

  let aiProvider: AppSettings["aiProvider"] = $state("noop");
  let codexBin = $state("codex");
  let codexModel = $state("gpt-5.4");
  let codexTimeoutMs = $state(60000);

  $effect(() => {
    if (!settings) {
      return;
    }

    aiProvider = settings.aiProvider;
    codexBin = settings.codexBin;
    codexModel = settings.codexModel;
    codexTimeoutMs = settings.codexTimeoutMs;
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onSave({
      aiProvider,
      codexBin: codexBin.trim() || "codex",
      codexModel: codexModel.trim() || "gpt-5.4",
      codexTimeoutMs: Number(codexTimeoutMs),
      automaticAiAudit: settings?.automaticAiAudit ?? "off",
    });
  }
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

  <form class="settings-form" onsubmit={submit}>
    <label class="field">
      <span>Provider</span>
      <select class="input" bind:value={aiProvider}>
        <option value="noop">No AI provider</option>
        <option value="codex-app-server">Codex app-server</option>
      </select>
    </label>

    {#if aiProvider === "codex-app-server"}
      <div class="provider-fields">
        <label class="field">
          <span>Codex command</span>
          <input class="input" bind:value={codexBin} type="text" placeholder="codex" />
        </label>
        <label class="field">
          <span>Model</span>
          <input class="input" bind:value={codexModel} type="text" placeholder="gpt-5.4" />
        </label>
        <label class="field">
          <span>Timeout ms</span>
          <input class="input" bind:value={codexTimeoutMs} type="number" min="5000" max="300000" step="1000" />
        </label>
      </div>
      <p class="settings-note">Requires the Codex CLI to be installed and signed in on this machine. Provider auth stays in the backend.</p>
      <p class="settings-note">AI-first draft strategy starts automatically near your turn. Failed requests remain visible and can be retried.</p>
    {:else}
      <p class="settings-note">Draft tracking and data imports remain available, but the app will not generate pick recommendations.</p>
    {/if}

    {#if providerStatus?.detail}
      <p class="settings-note">{providerStatus.detail}</p>
    {/if}

    {#if error}
      <p class="callout callout-danger">{error}</p>
    {/if}

    <div class="settings-actions">
      <button class="btn btn-primary" type="submit" disabled={isSaving || !settings}>
        {isSaving ? "Saving" : "Save settings"}
      </button>
      <button class="btn btn-secondary" type="button" disabled={isCopyingDiagnostics} onclick={onCopyDiagnostics}>
        <Icon name="clipboard" size={14} />
        {isCopyingDiagnostics ? "Copying" : "Copy diagnostics"}
      </button>
    </div>

    {#if diagnosticsStatus}
      <p class="settings-note">{diagnosticsStatus}</p>
    {/if}
  </form>

  {#if draftDataAvailable && onManageDraftData}
    <button class="maintenance-action" type="button" onclick={onManageDraftData}>
      <Icon name="upload" size={17} />
      <span>
        <strong>Draft data</strong>
        <small>{draftDataStatus}</small>
      </span>
      <Icon name="chevron-right" size={14} />
    </button>
  {/if}

  <DataManagementPanel {onResetComplete} />
</section>

<style>
  .settings-panel {
    display: grid;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .settings-form,
  .provider-fields {
    display: grid;
    gap: var(--space-3);
  }

  .provider-fields {
    grid-template-columns: minmax(0, 1fr) minmax(160px, 0.55fr) minmax(130px, 0.35fr);
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

  @media (max-width: 720px) {
    .provider-fields {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .settings-panel > .panel-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>

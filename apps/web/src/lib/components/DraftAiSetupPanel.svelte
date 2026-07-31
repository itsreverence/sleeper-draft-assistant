<script lang="ts">
  import AiProviderForm from "./AiProviderForm.svelte";
  import Icon from "./Icon.svelte";
  import type { AiProviderStatus, AppSettings } from "../types";

  let {
    settings,
    providerStatus,
    isSaving,
    error,
    onSave,
  }: {
    settings: AppSettings | null;
    providerStatus: AiProviderStatus | null;
    isSaving: boolean;
    error: string;
    onSave: (settings: AppSettings) => void;
  } = $props();

  let editing = $state(false);
  const aiReady = $derived(
    providerStatus?.id === "codex-app-server" && providerStatus.configured,
  );
</script>

<section class="panel ai-setup" aria-labelledby="ai-setup-title">
  <div class="ai-setup-heading">
    <div class="setup-icon" class:ready={aiReady}>
      <Icon name={aiReady ? "check-circle" : "message"} size={18} />
    </div>
    <div>
      <span class="section-label">AI manager</span>
      <h2 id="ai-setup-title">{aiReady ? "Codex is selected" : "Choose how draft advice works"}</h2>
      <p>
        {aiReady
          ? "Draft strategy and follow-up questions will use your local Codex login."
          : "Connect Codex for AI recommendations, or explicitly continue with the live board and imported data only."}
      </p>
    </div>
    {#if aiReady && !editing}
      <button class="btn btn-secondary" type="button" onclick={() => (editing = true)}>
        Change
      </button>
    {/if}
  </div>

  {#if !aiReady || editing}
    <div class="provider-editor">
      <AiProviderForm
        {settings}
        {providerStatus}
        {isSaving}
        {error}
        submitLabel={aiReady ? "Save AI settings" : "Confirm AI choice"}
        {onSave}
      />
    </div>
  {/if}
</section>

<style>
  .ai-setup {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .ai-setup-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3);
  }

  .setup-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-muted);
  }

  .setup-icon.ready {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .section-label {
    display: block;
    margin-bottom: 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  h2 {
    font-size: var(--text-lg);
  }

  .ai-setup-heading p {
    margin-top: 5px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .provider-editor {
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }

  @media (max-width: 640px) {
    .ai-setup-heading {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .ai-setup-heading > .btn {
      grid-column: 1 / -1;
      width: 100%;
    }
  }
</style>

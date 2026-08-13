<script lang="ts">
  import type { AiProviderStatus, AppSettings } from "../types";

  const defaultCodexModel = "gpt-5.6-terra";

  let {
    settings,
    providerStatus,
    isSaving,
    error = "",
    submitLabel = "Save AI settings",
    requireCodex = false,
    onSave,
  }: {
    settings: AppSettings | null;
    providerStatus: AiProviderStatus | null;
    isSaving: boolean;
    error?: string;
    submitLabel?: string;
    requireCodex?: boolean;
    onSave: (settings: AppSettings) => void;
  } = $props();

  let aiProvider: AppSettings["aiProvider"] = $state("noop");
  let codexBin = $state("codex");
  let codexModel = $state(defaultCodexModel);
  let codexTimeoutMs = $state(60000);

  $effect(() => {
    if (!settings) {
      return;
    }

    aiProvider = requireCodex ? "codex-app-server" : settings.aiProvider;
    codexBin = settings.codexBin;
    codexModel = settings.codexModel;
    codexTimeoutMs = settings.codexTimeoutMs;
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onSave({
      aiProvider,
      codexBin: codexBin.trim() || "codex",
      codexModel: codexModel.trim() || defaultCodexModel,
      codexTimeoutMs: Number(codexTimeoutMs),
      automaticAiAudit: settings?.automaticAiAudit ?? "off",
      aiSetupAcknowledged: true,
    });
  }
</script>

<form class="provider-form" onsubmit={submit}>
  <label class="field">
    <span>Provider</span>
    <select class="input" bind:value={aiProvider}>
      {#if !requireCodex}
        <option value="noop">Disable AI</option>
      {/if}
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
        <input class="input" bind:value={codexModel} type="text" list="codex-model-options" placeholder={defaultCodexModel} />
        <datalist id="codex-model-options">
          <option value="gpt-5.6-luna">Luna - efficient</option>
          <option value="gpt-5.6-terra">Terra - balanced</option>
          <option value="gpt-5.6-sol">Sol - frontier</option>
        </datalist>
      </label>
      <label class="field">
        <span>Timeout ms</span>
        <input class="input" bind:value={codexTimeoutMs} type="number" min="5000" max="300000" step="1000" />
      </label>
    </div>
    <p class="form-note">Terra is the balanced default. Choose Luna for efficiency or Sol for maximum capability.</p>
    <p class="form-note">Requires the Codex CLI to be installed and signed in on this machine. Authentication remains in Codex.</p>
    <p class="form-note">The backend keeps one local app-server session active and reuses draft conversations while the app is running.</p>
  {:else}
    <p class="form-note">AI recommendations and assistant questions are disabled.</p>
  {/if}

  {#if providerStatus?.detail}
    <p class="form-note">{providerStatus.detail}</p>
  {/if}

  {#if error}
    <p class="callout callout-danger">{error}</p>
  {/if}

  <button class="btn btn-primary" type="submit" disabled={isSaving || !settings}>
    {isSaving ? "Saving" : submitLabel}
  </button>
</form>

<style>
  .provider-form,
  .provider-fields {
    display: grid;
    gap: var(--space-3);
  }

  .provider-fields {
    grid-template-columns: minmax(0, 1fr) minmax(160px, 0.55fr) minmax(130px, 0.35fr);
  }

  .form-note {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .provider-form > .btn {
    justify-self: start;
  }

  @media (max-width: 720px) {
    .provider-fields {
      grid-template-columns: 1fr;
    }

    .provider-form > .btn {
      width: 100%;
    }
  }
</style>

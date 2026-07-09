<script lang="ts">
  import type { AiProviderStatus, AppSettings, ExperimentalCodexAuthStatus } from "../types";

  let {
    settings,
    providerStatus,
    isSaving,
    error,
    codexAuthStatus,
    isStartingCodexLogin,
    isPollingCodexLogin,
    onSave,
    onStartCodexLogin,
    onPollCodexLogin,
    onLogoutCodex,
  }: {
    settings: AppSettings | null;
    providerStatus: AiProviderStatus | null;
    isSaving: boolean;
    error: string;
    codexAuthStatus: ExperimentalCodexAuthStatus | null;
    isStartingCodexLogin: boolean;
    isPollingCodexLogin: boolean;
    onSave: (settings: AppSettings) => void;
    onStartCodexLogin: () => void;
    onPollCodexLogin: () => void;
    onLogoutCodex: () => void;
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
        <option value="noop">Deterministic fallback</option>
        <option value="experimental-codex-backend">Experimental Codex backend</option>
        <option value="codex-app-server">Codex app-server</option>
      </select>
    </label>

    {#if aiProvider === "codex-app-server" || aiProvider === "experimental-codex-backend"}
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
      {#if aiProvider === "codex-app-server"}
        <p class="settings-note">Requires the Codex CLI to be installed and signed in on this machine. Provider auth stays in the backend.</p>
      {:else}
        <div class="codex-auth-box">
          <strong>{codexAuthStatus?.authenticated ? "Codex backend connected" : "Codex backend login"}</strong>
          {#if codexAuthStatus?.authenticated}
            <p>Authenticated with local backend token storage.</p>
            <button class="btn btn-secondary" type="button" onclick={onLogoutCodex}>Log out</button>
          {:else if codexAuthStatus?.userCode && codexAuthStatus?.verificationUri}
            <p>Open the verification page and enter this code.</p>
            <a href={codexAuthStatus.verificationUri} target="_blank" rel="noreferrer">{codexAuthStatus.verificationUri}</a>
            <code>{codexAuthStatus.userCode}</code>
            <button class="btn btn-secondary" type="button" disabled={isPollingCodexLogin} onclick={onPollCodexLogin}>
              {isPollingCodexLogin ? "Checking" : "I approved login"}
            </button>
          {:else}
            <p>Starts the ChatGPT/Codex device-code flow used by the experimental backend provider.</p>
            <button class="btn btn-secondary" type="button" disabled={isStartingCodexLogin} onclick={onStartCodexLogin}>
              {isStartingCodexLogin ? "Starting" : "Start Codex login"}
            </button>
          {/if}
        </div>
      {/if}
    {:else}
      <p class="settings-note">Uses deterministic draft signals only. No external AI provider is called.</p>
    {/if}

    {#if providerStatus?.detail}
      <p class="settings-note">{providerStatus.detail}</p>
    {/if}

    {#if error}
      <p class="callout callout-danger">{error}</p>
    {/if}

    <button class="btn btn-primary" type="submit" disabled={isSaving || !settings}>
      {isSaving ? "Saving" : "Save settings"}
    </button>
  </form>
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

  .settings-note {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .codex-auth-box {
    display: grid;
    gap: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-4);
  }

  .codex-auth-box p {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .codex-auth-box a {
    word-break: break-all;
  }

  .codex-auth-box code {
    display: inline-flex;
    justify-self: start;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    padding: 6px 10px;
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  @media (max-width: 720px) {
    .provider-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
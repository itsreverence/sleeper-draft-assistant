<script lang="ts">
  import type { AiProviderStatus, AppSettings } from "../types";
  import Icon from "./Icon.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";

  let {
    settings,
    providerStatus,
    isSaving,
    error,
    isCopyingDiagnostics,
    diagnosticsStatus,
    draftDataAvailable = false,
    draftDataStatus = "",
    onSave,
    onCopyDiagnostics,
    onResetComplete,
    onManageDraftData,
    onClose,
  }: {
    settings: AppSettings | null;
    providerStatus: AiProviderStatus | null;
    isSaving: boolean;
    error: string;
    isCopyingDiagnostics: boolean;
    diagnosticsStatus: string;
    draftDataAvailable?: boolean;
    draftDataStatus?: string;
    onSave: (settings: AppSettings) => void;
    onCopyDiagnostics: () => void;
    onResetComplete: () => void;
    onManageDraftData?: () => void;
    onClose: () => void;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="drawer-backdrop" type="button" aria-label="Close settings" onclick={onClose}></button>
<div class="settings-drawer" role="dialog" aria-modal="true" aria-label="Application settings">
  <button class="drawer-close" type="button" aria-label="Close settings" title="Close settings" onclick={onClose}>
    <Icon name="close" size={16} />
  </button>

  <header class="drawer-heading">
    <h2><Icon name="settings" size={18} /> Settings</h2>
    <p>Configure AI behavior, draft data, and local app storage.</p>
  </header>

  <SettingsPanel
    {settings}
    {providerStatus}
    {isSaving}
    {error}
    {isCopyingDiagnostics}
    {diagnosticsStatus}
    {draftDataAvailable}
    {draftDataStatus}
    embedded={true}
    {onSave}
    {onCopyDiagnostics}
    {onResetComplete}
    {onManageDraftData}
  />
</div>

<style>
  .drawer-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 0.52);
    cursor: default;
  }

  .settings-drawer {
    position: fixed;
    z-index: 41;
    top: 0;
    right: 0;
    display: grid;
    align-content: start;
    width: min(600px, 94vw);
    height: 100vh;
    overflow-y: auto;
    border-left: 1px solid var(--border-strong);
    background: var(--surface-raised);
    box-shadow: -18px 0 50px rgb(0 0 0 / 0.28);
    padding: 48px var(--space-5) var(--space-6);
  }

  .drawer-close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .drawer-close:hover {
    border-color: var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .drawer-heading {
    display: grid;
    gap: 7px;
    margin-bottom: var(--space-5);
  }

  .drawer-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-xl);
  }

  .drawer-heading p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  @media (max-width: 560px) {
    .settings-drawer {
      top: auto;
      bottom: 0;
      width: 100%;
      height: min(88vh, 760px);
      border-top: 1px solid var(--border-strong);
      border-left: 0;
      padding-top: 48px;
    }
  }
</style>

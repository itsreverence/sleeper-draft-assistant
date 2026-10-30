<script lang="ts">
  import type { AiProviderStatus, AppSettings } from "../types";
  import Drawer from "./Drawer.svelte";
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
    onResetComplete: (settings: AppSettings) => void | Promise<void>;
    onManageDraftData?: () => void;
    onClose: () => void;
  } = $props();

</script>

<Drawer
  label="Application settings"
  closeLabel="Close settings"
  title="Settings"
  icon="settings"
  subtitle="Set up the Assistant and manage data stored on this device."
  {onClose}
>
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
</Drawer>

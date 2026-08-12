<script lang="ts">
  import type { PlayerPreferenceLevel, PlayerPreferences } from "../types";

  let {
    playerPreferences = {},
    onSetPreference,
  }: {
    playerPreferences?: PlayerPreferences;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
  } = $props();
</script>

<section aria-label="Recommendation probe">
  <button type="button" onclick={() => onSetPreference?.("p-achane", "pin")}>Prioritize De'Von Achane</button>
  <button type="button" onclick={() => onSetPreference?.("p-achane", "fade")}>Deprioritize De'Von Achane</button>
  <output data-testid="recommendation-probe-preferences">{JSON.stringify(playerPreferences)}</output>
</section>

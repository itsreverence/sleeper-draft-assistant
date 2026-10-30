<script lang="ts">
  import type { PlayerPreferenceLevel, PlayerPreferences } from "../types";

  let {
    preferences = {},
    onSetPreference,
  }: {
    preferences?: PlayerPreferences;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
  } = $props();
</script>

<section aria-label="Player search probe">
  <button type="button" onclick={() => onSetPreference?.("p-achane", "pin")}>Prioritize De'Von Achane</button>
  <button type="button" onclick={() => onSetPreference?.("p-achane", "fade")}>Deprioritize De'Von Achane</button>
  <output data-testid="player-search-probe-preferences">{JSON.stringify(preferences)}</output>
</section>

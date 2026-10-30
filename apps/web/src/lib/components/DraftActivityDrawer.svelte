<script lang="ts">
  import type { DraftState } from "../types";
  import Drawer from "./Drawer.svelte";
  import PickFeedPanel from "./PickFeedPanel.svelte";
  import RosterPanel from "./RosterPanel.svelte";

  let { state, onClose }: { state: DraftState; onClose: () => void } = $props();
</script>

<Drawer label="Picks and roster" closeLabel="Close picks and roster" title="Picks and roster" icon="activity" {onClose}>
  <RosterPanel {state} playersOpen={true} />
  <PickFeedPanel {state} limit={12} />
</Drawer>

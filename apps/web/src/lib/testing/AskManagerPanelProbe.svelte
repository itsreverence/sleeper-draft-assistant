<script lang="ts">
  import type { DraftRecommendation } from "../types";

  let {
    recommendation = null,
  }: {
    recommendation?: DraftRecommendation | null;
  } = $props();
</script>

<section aria-label="Ask manager probe">
  <output data-testid="ask-manager-recommendation">
    {recommendation?.headline ?? "No recommendation"}
  </output>
</section>

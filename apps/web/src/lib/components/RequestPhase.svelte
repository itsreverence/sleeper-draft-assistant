<script lang="ts">
  import type { AiRequestPhase } from "../api";

  const labels: Record<AiRequestPhase, string> = {
    queued: "Waiting for another Assistant request…",
    thinking: "Thinking…",
    news: "Checking news…",
  };

  let { phase = "thinking" }: { phase?: AiRequestPhase } = $props();
</script>

<!-- Rendered inside the caller's live region. A role="status" here would announce each phase change twice. -->
<span class="request-phase">
  <span class="spinner" aria-hidden="true"></span>
  <span>{labels[phase]}</span>
</span>

<style>
  .request-phase {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
</style>

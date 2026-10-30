<script lang="ts">
  let { scope, message }: { scope: string; message: string } = $props();

  // A sync that leaves the message unchanged must stay silent, as must opening a room or switching drafts.
  let announcement = $state("");
  let announcedScope = "";
  let announcedMessage = "";
  $effect(() => {
    if (scope === announcedScope && message !== announcedMessage) {
      announcement = message;
    }
    announcedScope = scope;
    announcedMessage = message;
  });
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>

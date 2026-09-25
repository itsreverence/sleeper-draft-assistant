<script lang="ts">
  import { isNewsSourceUrl } from "@sleeper-draft-assistant/shared";
  let { text }: { text: string } = $props();
  const parts = $derived(text.split(/(\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g));
</script>

{#each parts as part}
  {@const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/)}
  {#if link && isNewsSourceUrl(link[2])}
    <a href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]} ↗</a>
  {:else}
    {part}
  {/if}
{/each}

<style>
  a { color: var(--accent); text-decoration: underline; overflow-wrap: anywhere; }
</style>

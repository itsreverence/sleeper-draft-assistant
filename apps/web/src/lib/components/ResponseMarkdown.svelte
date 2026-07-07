<script lang="ts">
  type MarkdownBlock =
    | { type: "heading"; text: string }
    | { type: "paragraph"; text: string }
    | { type: "list"; items: string[] };

  let { content }: { content: string } = $props();

  function stripMarkdownNoise(value: string): string {
    return value
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
  }

  function parseMarkdown(value: string): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    const lines = value.replace(/\r\n/g, "\n").split("\n");
    let paragraph: string[] = [];
    let listItems: string[] = [];

    function flushParagraph() {
      if (paragraph.length > 0) {
        blocks.push({ type: "paragraph", text: stripMarkdownNoise(paragraph.join(" ")) });
        paragraph = [];
      }
    }

    function flushList() {
      if (listItems.length > 0) {
        blocks.push({ type: "list", items: listItems.map(stripMarkdownNoise) });
        listItems = [];
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

      const heading = line.match(/^#{1,4}\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        blocks.push({ type: "heading", text: stripMarkdownNoise(heading[1] ?? "") });
        continue;
      }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        listItems.push(bullet[1] ?? "");
        continue;
      }

      const numbered = line.match(/^\d+\.\s+(.+)$/);
      if (numbered) {
        flushParagraph();
        listItems.push(numbered[1] ?? "");
        continue;
      }

      flushList();
      paragraph.push(line);
    }

    flushParagraph();
    flushList();
    return blocks;
  }

  const blocks = $derived(parseMarkdown(content));
</script>

<div class="response-markdown">
  {#each blocks as block}
    {#if block.type === "heading"}
      <h3>{block.text}</h3>
    {:else if block.type === "list"}
      <ul>
        {#each block.items as item}
          <li>{item}</li>
        {/each}
      </ul>
    {:else}
      <p>{block.text}</p>
    {/if}
  {/each}
</div>

<style>
  .response-markdown {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .response-markdown h3 {
    margin: 2px 0 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    line-height: 1.35;
  }

  .response-markdown p {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .response-markdown ul {
    display: grid;
    gap: 5px;
    margin: 0;
    padding-left: 17px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .response-markdown li::marker {
    color: var(--accent);
  }
</style>

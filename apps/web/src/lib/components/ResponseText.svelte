<script lang="ts" module>
  import { isNewsSourceUrl } from "@sleeper-draft-assistant/shared";

  type Inline =
    | { type: "text"; text: string }
    | { type: "code"; text: string }
    | { type: "strong" | "em"; children: Inline[] }
    | { type: "link"; href: string; children: Inline[] };

  const LINK = /^\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/;

  function runLength(text: string, index: number): number {
    let end = index;
    while (text[end] === text[index]) end++;
    return end - index;
  }

  const isSpace = (character: string | undefined) => character === undefined || /\s/.test(character);
  const isWord = (character: string | undefined) => character !== undefined && /[\p{L}\p{N}]/u.test(character);

  // GFM flanking, reduced: a marker opens when text follows it and closes when text precedes it.
  // `_` additionally refuses to open or close inside a word, so snake_case stays literal.
  function canOpen(text: string, index: number, length: number): boolean {
    return !isSpace(text[index + length]) && (text[index] === "*" || !isWord(text[index - 1]));
  }

  function canClose(text: string, index: number, length: number): boolean {
    return !isSpace(text[index - 1]) && (text[index] === "*" || !isWord(text[index + length]));
  }

  function findRun(text: string, from: number, marker: string, length: number, accept: (index: number) => boolean): number {
    for (let index = from; index < text.length; index++) {
      if (text[index] !== marker) continue;
      const run = runLength(text, index);
      if (run === length && accept(index)) return index;
      index += run - 1;
    }
    return -1;
  }

  function parseInline(text: string): Inline[] {
    const nodes: Inline[] = [];
    let plain = "";
    const flush = () => {
      if (plain) nodes.push({ type: "text", text: plain });
      plain = "";
    };
    let index = 0;
    while (index < text.length) {
      const character = text[index];
      if (character === "`") {
        const length = runLength(text, index);
        const close = findRun(text, index + length, "`", length, () => true);
        if (close !== -1) {
          flush();
          nodes.push({ type: "code", text: text.slice(index + length, close) });
          index = close + length;
          continue;
        }
        plain += text.slice(index, index + length);
        index += length;
        continue;
      }
      if (character === "[") {
        const link = LINK.exec(text.slice(index));
        if (link && isNewsSourceUrl(link[2])) {
          flush();
          nodes.push({ type: "link", href: link[2], children: parseInline(link[1]) });
          index += link[0].length;
          continue;
        }
      }
      if (character === "*" || character === "_") {
        const length = runLength(text, index);
        const close = length <= 2 && canOpen(text, index, length)
          ? findRun(text, index + length, character, length, (at) => canClose(text, at, length))
          : -1;
        if (close !== -1) {
          flush();
          nodes.push({ type: length === 2 ? "strong" : "em", children: parseInline(text.slice(index + length, close)) });
          index = close + length;
          continue;
        }
        plain += text.slice(index, index + length);
        index += length;
        continue;
      }
      plain += character;
      index++;
    }
    flush();
    return nodes;
  }
</script>

<script lang="ts">
  let { text }: { text: string } = $props();
  const nodes = $derived(parseInline(text));
</script>

{#snippet inline(nodes: Inline[])}
  {#each nodes as node}
    {#if node.type === "text"}
      {node.text}
    {:else if node.type === "code"}
      <code>{node.text}</code>
    {:else if node.type === "strong"}
      <strong>{@render inline(node.children)}</strong>
    {:else if node.type === "em"}
      <em>{@render inline(node.children)}</em>
    {:else if node.type === "link"}
      <a href={node.href} target="_blank" rel="noopener noreferrer">{@render inline(node.children)} ↗</a>
    {/if}
  {/each}
{/snippet}

{@render inline(nodes)}

<style>
  a { color: var(--accent); text-decoration: underline; overflow-wrap: anywhere; }
  strong { color: var(--text-primary); font-weight: 600; }
  a strong { color: inherit; }
  :global(th) strong { font-weight: 700; }
  code {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    overflow-wrap: anywhere;
  }
</style>

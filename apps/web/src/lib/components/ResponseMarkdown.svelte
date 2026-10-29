<script lang="ts">
  import ResponseText from "./ResponseText.svelte";
  type Alignment = "left" | "center" | "right";
  type MarkdownBlock =
    | { type: "heading"; text: string }
    | { type: "paragraph"; text: string }
    | { type: "list"; items: string[] }
    | { type: "table"; headers: string[]; alignments: Alignment[]; rows: string[][] };

  let { content }: { content: string } = $props();

  function stripMarkdownNoise(value: string): string {
    return value
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
  }

  // Split before stripping inline markup so escaped pipes stay inside their cell.
  function tableCells(line: string): { cells: string[]; hasPipe: boolean } {
    const cells: string[] = [];
    let cell = "";
    let hasPipe = false;
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === "\\" && line[index + 1] === "|") {
        cell += "|";
        index++;
      } else if (character === "|") {
        cells.push(cell.trim());
        cell = "";
        hasPipe = true;
      } else {
        cell += character;
      }
    }
    cells.push(cell.trim());
    if (line.startsWith("|")) cells.shift();
    // An escaped final pipe belongs to the last cell, not the row boundary.
    if (cell === "" && line.endsWith("|")) cells.pop();
    return { cells, hasPipe };
  }

  function tableAlignment(cell: string): Alignment {
    if (cell.endsWith(":")) return cell.startsWith(":") ? "center" : "right";
    return "left";
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

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

      const headerCells = tableCells(line);
      const delimiterLine = (lines[index + 1] ?? "").trim();
      const delimiterCells = tableCells(delimiterLine);
      const headers = headerCells.cells;
      const delimiter = delimiterCells.cells;
      if ((headerCells.hasPipe || delimiterCells.hasPipe) && headers.length > 0 && headers.length === delimiter.length
        && delimiter.every(cell => /^:?-{3,}:?$/.test(cell))) {
        flushParagraph();
        flushList();
        const rows: string[][] = [];
        index++;
        while (index + 1 < lines.length) {
          const nextLine = lines[index + 1].trim();
          if (!nextLine || /^(?:#{1,4}\s|[-*]\s|\d+\.\s)/.test(nextLine)) break;
          const { cells } = tableCells(nextLine);
          rows.push(headers.map((_, column) => stripMarkdownNoise(cells[column] ?? "")));
          index++;
        }
        blocks.push({
          type: "table", headers: headers.map(stripMarkdownNoise),
          alignments: delimiter.map(tableAlignment), rows,
        });
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
      <h3><ResponseText text={block.text} /></h3>
    {:else if block.type === "list"}
      <ul>
        {#each block.items as item}
          <li><ResponseText text={item} /></li>
        {/each}
      </ul>
    {:else if block.type === "table"}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll wide tables.) -->
      <div class="table-scroll" role="region" aria-label="Response table" tabindex="0">
        <table>
          <thead>
            <tr>
              {#each block.headers as header, column}
                <th scope="col" class={block.alignments[column]}><ResponseText text={header} /></th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each block.rows as row}
              <tr>
                {#each row as cell, column}
                  <td class={block.alignments[column]}><ResponseText text={cell} /></td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p><ResponseText text={block.text} /></p>
    {/if}
  {/each}
</div>

<style>
  .response-markdown {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .table-scroll {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .table-scroll:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  th, td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    min-width: 7rem;
  }

  th {
    color: var(--text-primary);
    background: var(--surface-raised);
    font-weight: 700;
  }

  tbody tr:last-child td { border-bottom: 0; }
  .left { text-align: left; }
  .center { text-align: center; }
  .right { text-align: right; }

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

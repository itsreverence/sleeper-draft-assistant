<script lang="ts">
  import ResponseText from "./ResponseText.svelte";
  type Alignment = "left" | "center" | "right";
  type List = { ordered: boolean; start: number; items: string[] };
  type MarkdownBlock =
    | { type: "heading"; text: string }
    | { type: "paragraph"; text: string }
    | ({ type: "list" } & List)
    | { type: "table"; number: number; headers: string[]; alignments: Alignment[]; rows: string[][] };

  let { content }: { content: string } = $props();
  const answerId = $props.id();

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
    let list: List | null = null;
    let tables = 0;

    function flushParagraph() {
      if (paragraph.length > 0) {
        blocks.push({ type: "paragraph", text: paragraph.join(" ") });
        paragraph = [];
      }
    }

    function flushList() {
      if (list) blocks.push({ type: "list", ...list });
      list = null;
    }

    function pushItem(ordered: boolean, start: number, item: string) {
      flushParagraph();
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, start, items: [] };
      list.items.push(item);
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
        && delimiter.every(cell => /^:?-+:?$/.test(cell))) {
        flushParagraph();
        flushList();
        const rows: string[][] = [];
        index++;
        while (index + 1 < lines.length) {
          const nextLine = lines[index + 1].trim();
          if (!nextLine || /^(?:#{1,4}\s|[-*]\s|\d+\.\s)/.test(nextLine)) break;
          const { cells } = tableCells(nextLine);
          rows.push(headers.map((_, column) => cells[column] ?? ""));
          index++;
        }
        blocks.push({ type: "table", number: ++tables, headers, alignments: delimiter.map(tableAlignment), rows });
        continue;
      }

      const heading = line.match(/^#{1,4}\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        blocks.push({ type: "heading", text: heading[1] ?? "" });
        continue;
      }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        pushItem(false, 1, bullet[1] ?? "");
        continue;
      }

      const numbered = line.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) {
        pushItem(true, Number(numbered[1]), numbered[2] ?? "");
        continue;
      }

      flushList();
      paragraph.push(line);
    }

    flushParagraph();
    flushList();
    return blocks;
  }

  // Keyboard users need to scroll a wide table; a table that fits must not be an extra tab stop.
  function focusableWhenScrollable(node: HTMLElement) {
    const update = () => {
      if (node.scrollWidth > node.clientWidth) node.setAttribute("tabindex", "0");
      else node.removeAttribute("tabindex");
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return { destroy: () => observer.disconnect() };
  }

  const blocks = $derived(parseMarkdown(content));
</script>

<div class="response-markdown">
  {#each blocks as block}
    {#if block.type === "heading"}
      <h3><ResponseText text={block.text} /></h3>
    {:else if block.type === "list" && block.ordered}
      <ol start={block.start}>
        {#each block.items as item}
          <li><ResponseText text={item} /></li>
        {/each}
      </ol>
    {:else if block.type === "list"}
      <ul>
        {#each block.items as item}
          <li><ResponseText text={item} /></li>
        {/each}
      </ul>
    {:else if block.type === "table"}
      <div class="table-scroll" role="region" aria-label="Response table {block.number} in answer {answerId}" use:focusableWhenScrollable>
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

  .response-markdown ul,
  .response-markdown ol {
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

import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ResponseMarkdown from "./ResponseMarkdown.svelte";

describe("news source rendering", () => {
  it("links official NFL AMP articles but not lookalike hosts", () => {
    render(ResponseMarkdown, { content: "[NFL report](https://amp.nfl.com/news/report)\n[Lookalike](https://amp.nfl.com.evil.test/news/report)" });
    expect(screen.getByRole("link", { name: /NFL report/ }).getAttribute("href")).toBe("https://amp.nfl.com/news/report");
    expect(screen.queryByRole("link", { name: /Lookalike/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
  it("links allowlisted HTTPS sources without rendering arbitrary HTML or links", () => {
    render(ResponseMarkdown, { content: "- [Report](https://www.nfl.com/news/report)\n- [Unsafe](https://evil.test/news)\n\n<img src=x onerror=alert(1)>" });
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://www.nfl.com/news/report");
    expect(screen.getByRole("link").getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "Unsafe" })).toBeNull();
  });
});

describe("pipe tables", () => {
  it.each([
    "| Player | Points |\n| --- | --- |\n| Test QB | 20 |",
    "Player | Points\n--- | ---\nTest QB | 20",
    "Player | Points |\n| --- | ---\n| Test QB | 20",
  ])("renders optional outer pipes as semantic table cells", content => {
    render(ResponseMarkdown, { content });
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["Player", "Points"]);
    expect(screen.getAllByRole("columnheader").every(node => node.getAttribute("scope") === "col")).toBe(true);
    expect(screen.getAllByRole("cell").map(node => node.textContent)).toEqual(["Test QB", "20"]);
    expect(screen.getByRole("region", { name: "Response table" }).getAttribute("tabindex")).toBe("0");
  });

  it("applies delimiter alignment to headers and cells", () => {
    render(ResponseMarkdown, { content: "A | B | C | D\n--- | :--- | ---: | :---:\na | b | c | d" });
    expect(screen.getAllByRole("columnheader").map(node => Array.from(node.classList).filter(value => ["left", "center", "right"].includes(value)).join(" "))).toEqual(["left", "left", "right", "center"]);
    expect(screen.getAllByRole("cell").map(node => Array.from(node.classList).filter(value => ["left", "center", "right"].includes(value)).join(" "))).toEqual(["left", "left", "right", "center"]);
  });

  it("preserves escaped pipes, including at cell edges, and normalizes ragged rows", () => {
    render(ResponseMarkdown, { content: String.raw`| A\|B | C |
| --- | --- |
| \|start | end\|
| short |
| first | second | discarded |` });
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["A|B", "C"]);
    expect(screen.getAllByRole("cell").map(node => node.textContent)).toEqual(["|start", "end|", "short", "", "first", "second"]);
  });

  it.each([
    "ordinary | pipe text\nstill a paragraph",
    "|\n|",
    "A | B\n-- | ---\na | b",
    "A | B\n--- | --- | ---\na | b",
    String.raw`A\|B
--- | ---`,
  ])("leaves pipe text without a matching valid delimiter as a paragraph", content => {
    const { container } = render(ResponseMarkdown, { content });
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe(content.replace(/\n/g, " "));
  });

  it("keeps adjacent paragraphs, lists and headings in order", () => {
    const { container } = render(ResponseMarkdown, { content: "## **Lineup**\nBefore the table.\n- **First**\nA | B\n--- | ---\na | b\n1. __Next__\nAfter `table`." });
    expect(Array.from(container.querySelector(".response-markdown")!.children).map(node => node.tagName)).toEqual(["H3", "P", "UL", "DIV", "UL", "P"]);
    expect(screen.getAllByRole("listitem").map(node => node.textContent)).toEqual(["First", "Next"]);
    expect(screen.getByText("After table.")).toBeTruthy();
  });

  it("pads a body row without pipes and ends the table at a blank line", () => {
    render(ResponseMarkdown, { content: "A | B\r\n--- | ---\r\nonly one cell\\|with pipe\r\n\r\nA following paragraph." });
    expect(screen.getAllByRole("cell").map(node => node.textContent)).toEqual(["only one cell|with pipe", ""]);
    expect(screen.getByText("A following paragraph.").tagName).toBe("P");
  });

  it("renders a header-only table", () => {
    render(ResponseMarkdown, { content: "A | B\n--- | ---" });
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.queryAllByRole("cell")).toHaveLength(0);
  });

  it("uses existing inline cleanup and safe source links in cells", () => {
    render(ResponseMarkdown, { content: "**Player** | __Source__\n--- | ---\n`Test QB` | [Report](https://www.nfl.com/news/report)\n<img src=x onerror=alert(1)> | [Unsafe](https://evil.test/news)" });
    expect(screen.getByRole("columnheader", { name: "Player" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Test QB" })).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it.each(["| Player |\n---\n| Test QB |", "Player\n| --- |\n| Test QB |"])("supports one-column tables with an outer pipe on either header line", content => {
    render(ResponseMarkdown, { content });
    expect(screen.getByRole("columnheader").textContent).toBe("Player");
    expect(screen.getByRole("cell").textContent).toBe("Test QB");
  });
});

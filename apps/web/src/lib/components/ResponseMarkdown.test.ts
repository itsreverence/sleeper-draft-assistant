import { render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResponseMarkdown from "./ResponseMarkdown.svelte";

const texts = (container: HTMLElement, selector: string) => Array.from(container.querySelectorAll(selector), node => node.textContent);

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

describe("inline formatting", () => {
  it("renders bold, emphasis and code without their markers", () => {
    const { container } = render(ResponseMarkdown, { content: "**Start** __him__ and *wait* on _TE_ with `code`." });
    expect(container.querySelector("p")!.textContent).toBe("Start him and wait on TE with code.");
    expect(texts(container, "strong")).toEqual(["Start", "him"]);
    expect(texts(container, "em")).toEqual(["wait", "TE"]);
    expect(texts(container, "code")).toEqual(["code"]);
  });

  it("leaves ambiguous or unmatched markers as literal text", () => {
    const content = "5 * 3, RB1*, snake_case_name, a ** b ** c, ***both***, `unclosed and _ alone";
    const { container } = render(ResponseMarkdown, { content });
    expect(container.querySelector("p")!.textContent).toBe(content);
    expect(container.querySelector("strong, em, code")).toBeNull();
  });

  it("keeps code spans literal, including markers and HTML", () => {
    const { container } = render(ResponseMarkdown, { content: "Run `**not bold** <b>x</b>` now" });
    expect(texts(container, "code")).toEqual(["**not bold** <b>x</b>"]);
    expect(container.querySelector("strong, b")).toBeNull();
  });

  it("ignores emphasis markers inside a code span when finding the closing marker", () => {
    const { container } = render(ResponseMarkdown, { content: "*see `a*b` now* and **use `**` for bold**" });
    expect(container.querySelector("p")!.textContent).toBe("see a*b now and use ** for bold");
    expect(texts(container, "em")).toEqual(["see a*b now"]);
    expect(texts(container, "strong")).toEqual(["use ** for bold"]);
    expect(texts(container, "code")).toEqual(["a*b", "**"]);
  });

  it("nests formatting inside links, links inside formatting, and code inside emphasis", () => {
    const { container } = render(ResponseMarkdown, {
      content: "**[Report](https://www.nfl.com/news/report)** then [**Bold**](https://www.nfl.com/news/report) and *a `b` c*",
    });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0].closest("strong")).not.toBeNull();
    expect(links[1].querySelector("strong")?.textContent).toBe("Bold");
    expect(container.querySelector("em code")?.textContent).toBe("b");
  });

  it("formats the label of a rejected link without linking it", () => {
    const { container } = render(ResponseMarkdown, { content: "[**Unsafe**](https://evil.test/news)" });
    expect(screen.queryByRole("link")).toBeNull();
    expect(texts(container, "strong")).toEqual(["Unsafe"]);
    expect(container.querySelector("p")!.textContent).toBe("[Unsafe](https://evil.test/news)");
  });

  it("formats headings and list items", () => {
    const { container } = render(ResponseMarkdown, { content: "## **Lineup**\n- `QB` *now*" });
    expect(container.querySelector("h3 strong")?.textContent).toBe("Lineup");
    expect(container.querySelector("li code")?.textContent).toBe("QB");
    expect(container.querySelector("li em")?.textContent).toBe("now");
  });
});

describe("ordered lists", () => {
  it("renders numbered items as an ordered list", () => {
    render(ResponseMarkdown, { content: "1. One\n2. Two" });
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(list.getAttribute("start")).toBe("1");
    expect(screen.getAllByRole("listitem").map(node => node.textContent)).toEqual(["One", "Two"]);
  });

  it("starts numbering from the first item's number", () => {
    render(ResponseMarkdown, { content: "3. Three\n4. Four" });
    expect(screen.getByRole("list").getAttribute("start")).toBe("3");
  });

  it("splits lists where the marker kind changes", () => {
    const { container } = render(ResponseMarkdown, { content: "- a\n1. b\n2. c\n- d" });
    expect(Array.from(container.querySelector(".response-markdown")!.children).map(node => node.tagName)).toEqual(["UL", "OL", "UL"]);
    expect(screen.getAllByRole("listitem").map(node => node.textContent)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("pipe tables", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "| Player | Points |\n| --- | --- |\n| Test QB | 20 |",
    "Player | Points\n--- | ---\nTest QB | 20",
    "Player | Points |\n| --- | ---\n| Test QB | 20",
  ])("renders optional outer pipes as semantic table cells", content => {
    render(ResponseMarkdown, { content });
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["Player", "Points"]);
    expect(screen.getAllByRole("columnheader").every(node => node.getAttribute("scope") === "col")).toBe(true);
    expect(screen.getAllByRole("cell").map(node => node.textContent)).toEqual(["Test QB", "20"]);
    expect(screen.getByRole("region", { name: "Response table 1" })).toBeTruthy();
  });

  it("applies delimiter alignment to headers and cells", () => {
    render(ResponseMarkdown, { content: "A | B | C | D\n--- | :--- | ---: | :---:\na | b | c | d" });
    expect(screen.getAllByRole("columnheader").map(node => Array.from(node.classList).filter(value => ["left", "center", "right"].includes(value)).join(" "))).toEqual(["left", "left", "right", "center"]);
    expect(screen.getAllByRole("cell").map(node => Array.from(node.classList).filter(value => ["left", "center", "right"].includes(value)).join(" "))).toEqual(["left", "left", "right", "center"]);
  });

  it.each([
    ["| A |\n|-|\n| a |", ["left"]],
    ["| A | B |\n| :-: | -: |\n| a | b |", ["center", "right"]],
    ["A | B\n-- | ---\na | b", ["left", "left"]],
  ])("accepts GitHub-valid delimiter cells shorter than three dashes", (content, alignments) => {
    render(ResponseMarkdown, { content });
    expect(screen.getAllByRole("columnheader").map(node => Array.from(node.classList).filter(value => ["left", "center", "right"].includes(value)).join(" "))).toEqual(alignments);
    expect(screen.getAllByRole("cell")).toHaveLength(alignments.length);
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
    "A | B\n: | :\na | b",
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
    expect(Array.from(container.querySelector(".response-markdown")!.children).map(node => node.tagName)).toEqual(["H3", "P", "UL", "DIV", "OL", "P"]);
    expect(screen.getAllByRole("listitem").map(node => node.textContent)).toEqual(["First", "Next"]);
    expect(container.querySelector("p:last-child")?.textContent).toBe("After table.");
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

  it("renders inline formatting and safe source links in cells", () => {
    const { container } = render(ResponseMarkdown, { content: "**Player** | __Source__\n--- | ---\n`Test QB` | [Report](https://www.nfl.com/news/report)\n<img src=x onerror=alert(1)> | [Unsafe](https://evil.test/news)" });
    expect(screen.getByRole("columnheader", { name: "Player" }).querySelector("strong")?.textContent).toBe("Player");
    expect(screen.getByRole("cell", { name: "Test QB" }).querySelector("code")?.textContent).toBe("Test QB");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it.each(["| Player |\n---\n| Test QB |", "Player\n| --- |\n| Test QB |"])("supports one-column tables with an outer pipe on either header line", content => {
    render(ResponseMarkdown, { content });
    expect(screen.getByRole("columnheader").textContent).toBe("Player");
    expect(screen.getByRole("cell").textContent).toBe("Test QB");
  });

  it("names every table region uniquely within and across answers", () => {
    const content = "A | B\n--- | ---\na | b\n\nC | D\n--- | ---\nc | d";
    render(ResponseMarkdown, { content, answerNumber: 1 });
    render(ResponseMarkdown, { content, answerNumber: 2 });
    expect(screen.getAllByRole("region").map(node => node.getAttribute("aria-label"))).toEqual([
      "Response table 1 in answer 1",
      "Response table 2 in answer 1",
      "Response table 1 in answer 2",
      "Response table 2 in answer 2",
    ]);
  });

  it("is a tab stop only while the table overflows its wrapper", () => {
    const observers: Array<{ callback: () => void; targets: Element[]; disconnected: boolean }> = [];
    vi.stubGlobal("ResizeObserver", class {
      targets: Element[] = [];
      disconnected = false;
      constructor(readonly callback: () => void) { observers.push(this); }
      observe(target: Element) { this.targets.push(target); }
      disconnect() { this.disconnected = true; }
    });
    const { unmount } = render(ResponseMarkdown, { content: "A | B\n--- | ---\na | b" });
    const region = screen.getByRole("region");
    expect(region.hasAttribute("tabindex")).toBe(false);
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([region, region.querySelector("table")]);
    let scrollWidth = 500;
    Object.defineProperty(region, "scrollWidth", { get: () => scrollWidth });
    Object.defineProperty(region, "clientWidth", { get: () => 300 });
    observers[0].callback();
    expect(region.getAttribute("tabindex")).toBe("0");
    scrollWidth = 300;
    observers[0].callback();
    expect(region.hasAttribute("tabindex")).toBe(false);
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });
});

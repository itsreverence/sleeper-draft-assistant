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

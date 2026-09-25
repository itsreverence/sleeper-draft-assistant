import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ResponseMarkdown from "./ResponseMarkdown.svelte";

describe("news source rendering", () => {
  it("links allowlisted HTTPS sources without rendering arbitrary HTML or links", () => {
    render(ResponseMarkdown, { content: "- [Report](https://www.nfl.com/news/report)\n- [Unsafe](https://evil.test/news)\n\n<img src=x onerror=alert(1)>" });
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://www.nfl.com/news/report");
    expect(screen.getByRole("link").getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "Unsafe" })).toBeNull();
  });
});

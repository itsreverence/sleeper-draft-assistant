import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import AiMessageBubble from "./AiMessageBubble.svelte";

it("copies the original Markdown after rendering a table", async () => {
  const content = "| **Player** | Points |\n| --- | ---: |\n| Test QB | 20 |";
  const onCopy = vi.fn();
  render(AiMessageBubble, { message: { id: "table", role: "assistant", status: "complete", content }, onCopy });
  expect(screen.getByRole("table")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(onCopy).toHaveBeenCalledExactlyOnceWith(content);
});

it("a cancelled message offers Retry but not Copy", async () => {
  const onRetry = vi.fn();
  render(AiMessageBubble, { message: { id: "cancelled", role: "assistant", status: "cancelled", content: "Cancelled." }, onRetry });
  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

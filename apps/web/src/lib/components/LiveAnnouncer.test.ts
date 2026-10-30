import { render } from "@testing-library/svelte";
import { expect, it } from "vitest";

import LiveAnnouncer from "./LiveAnnouncer.svelte";

function liveRegion(container: Element) {
  return container.querySelector('[aria-live="polite"]')!;
}

it("announces a change once and stays silent otherwise", async () => {
  const { container, rerender } = render(LiveAnnouncer, { scope: "draft", message: "Pick 1.02." });
  expect(liveRegion(container).textContent).toBe("");
  await rerender({ scope: "draft", message: "Pick 1.02." });
  expect(liveRegion(container).textContent).toBe("");
  await rerender({ scope: "draft", message: "Pick 1.03." });
  expect(liveRegion(container).textContent).toBe("Pick 1.03.");
  await rerender({ scope: "draft", message: "Pick 1.03." });
  expect(liveRegion(container).textContent).toBe("Pick 1.03.");
  expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
});

it("does not announce when switching to another draft", async () => {
  const { container, rerender } = render(LiveAnnouncer, { scope: "draft", message: "Pick 1.02." });
  await rerender({ scope: "other-draft", message: "Pick 1.05." });
  expect(liveRegion(container).textContent).toBe("");
});

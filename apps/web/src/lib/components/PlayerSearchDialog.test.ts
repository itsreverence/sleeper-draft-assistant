import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import PlayerSearchDialog from "./PlayerSearchDialog.svelte";
import { createDraftPayloadFixture } from "../testing/draft-fixtures";

it("Escape closes the preference menu before the search dialog and restores its trigger focus", async () => {
  const onClose = vi.fn();
  render(PlayerSearchDialog, {
    state: createDraftPayloadFixture({ draftId: "test-draft", name: "Test Draft" }).state,
    onSetPreference: vi.fn(),
    onClose,
  });
  await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "Achane" } });
  const trigger = screen.getByRole("button", { name: "Preference for De'Von Achane" });
  await fireEvent.click(trigger);
  // jsdom's popover shim tracks open state but does not implement this selector.
  const menu = screen.getByRole("menu");
  const matches = menu.matches.bind(menu);
  vi.spyOn(menu, "matches").mockImplementation((selector) => selector === ":popover-open"
    ? menu.hasAttribute("data-popover-open")
    : matches(selector));
  const option = screen.getByRole("menuitemradio", { name: /Prioritize/ });
  option.focus();
  await fireEvent.keyDown(option, { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(menu.hasAttribute("data-popover-open")).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  await fireEvent.keyDown(trigger, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

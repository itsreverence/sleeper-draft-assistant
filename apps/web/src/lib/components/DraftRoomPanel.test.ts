import { render, screen, within } from "@testing-library/svelte";
import { expect, it } from "vitest";

import { createDraftPayloadFixture } from "../testing/draft-fixtures";
import DraftRoomPanel from "./DraftRoomPanel.svelte";

const base = createDraftPayloadFixture({ draftId: "board-draft", name: "Board Draft" }).state;
const drafting = { ...base, status: "drafting" as const };

function liveRegion(container: Element) {
  return container.querySelector('[aria-live="polite"]')!;
}

it("exposes rounds, teams, picks and players as a table", () => {
  render(DraftRoomPanel, { state: drafting });
  const table = screen.getByRole("table", { name: "Draft picks by round and team" });
  const headers = within(table).getAllByRole("columnheader");
  expect(headers[0]?.textContent).toContain("Round");
  expect(headers).toHaveLength(drafting.settings.teams + 1);
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(3);
  const firstRound = within(rows[1]!);
  expect(firstRound.getByRole("rowheader").textContent).toContain("Round 1");
  expect(firstRound.getAllByRole("cell")).toHaveLength(drafting.settings.teams);
});

it("does not label a pick on the clock before the draft starts", async () => {
  const { container, rerender } = render(DraftRoomPanel, { state: { ...drafting, status: "pre_draft" as const } });
  expect(within(screen.getByRole("table")).queryByText("On the clock")).toBeNull();
  expect(container.querySelector('[data-current="true"]')).toBeNull();
  await rerender({ state: drafting });
  expect(within(screen.getByRole("table")).getByText("On the clock")).toBeTruthy();
});

it("announces a pick change once and stays silent otherwise", async () => {
  const { container, rerender } = render(DraftRoomPanel, { state: { ...drafting, currentPick: 2 } });
  expect(liveRegion(container).textContent).toBe("");

  await rerender({ state: { ...drafting, currentPick: 2, updatedAt: "2026-10-30T00:00:00.000Z" } });
  expect(liveRegion(container).textContent).toBe("");

  await rerender({ state: { ...drafting, currentPick: 3 } });
  expect(liveRegion(container).textContent).toContain("Pick 1.03");
  const announced = liveRegion(container).textContent;

  await rerender({ state: { ...drafting, currentPick: 3, updatedAt: "2026-10-30T00:00:02.000Z" } });
  expect(liveRegion(container).textContent).toBe(announced);
  expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
});

it("does not announce when switching to another draft", async () => {
  const { container, rerender } = render(DraftRoomPanel, { state: { ...drafting, currentPick: 2 } });
  await rerender({ state: { ...drafting, id: "other-draft", currentPick: 5 } });
  expect(liveRegion(container).textContent).toBe("");
});

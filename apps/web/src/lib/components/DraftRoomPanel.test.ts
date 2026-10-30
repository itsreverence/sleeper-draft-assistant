import { render, screen, within } from "@testing-library/svelte";
import { expect, it } from "vitest";

import { createDraftPayloadFixture } from "../testing/draft-fixtures";
import { upcomingUserPicks } from "../format";
import DraftRoomPanel from "./DraftRoomPanel.svelte";

const base = createDraftPayloadFixture({ draftId: "board-draft", name: "Board Draft" }).state;
const drafting = { ...base, status: "drafting" as const };

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
  expect(within(screen.getByRole("table")).queryByText("Now")).toBeNull();
  expect(container.querySelector('[data-current="true"]')).toBeNull();
  await rerender({ state: drafting });
  expect(within(screen.getByRole("table")).getByText("Now")).toBeTruthy();
});

it("marks the user's next pick only while drafting", async () => {
  const { rerender } = render(DraftRoomPanel, { state: drafting });
  const cell = within(screen.getByRole("table")).getByText("Your pick").closest('[role="cell"]')!;
  expect(cell.textContent).toContain(`#${upcomingUserPicks(drafting, 1)[0]}`);
  await rerender({ state: { ...drafting, status: "pre_draft" as const } });
  expect(within(screen.getByRole("table")).queryByText("Your pick")).toBeNull();
});

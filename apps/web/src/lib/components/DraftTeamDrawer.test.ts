import { render, screen, within } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import DraftTeamDrawer from "./DraftTeamDrawer.svelte";
import { createDraftPayloadFixture } from "../testing/draft-fixtures";

const { state } = createDraftPayloadFixture({ draftId: "test-draft", name: "Test Draft" });
const rival = state.teams.find((team) => team.id !== state.userTeamId)!;

it("marks the user's own team and offers no question about it", () => {
  const own = state.teams.find((team) => team.id === state.userTeamId)!;
  render(DraftTeamDrawer, { state, teamId: own.id, onClose: vi.fn(), onAsk: vi.fn() });
  const dialog = within(screen.getByRole("dialog", { name: `${own.name} roster` }));
  expect(dialog.getByText("Your team")).toBeTruthy();
  expect(dialog.queryByRole("button", { name: /Ask Assistant/ })).toBeNull();
});

it("offers a question about another team without the own-team marker", () => {
  render(DraftTeamDrawer, { state, teamId: rival.id, onClose: vi.fn(), onAsk: vi.fn() });
  const dialog = within(screen.getByRole("dialog", { name: `${rival.name} roster` }));
  expect(dialog.queryByText("Your team")).toBeNull();
  expect(dialog.getByRole("button", { name: /Ask Assistant/ })).toBeTruthy();
});

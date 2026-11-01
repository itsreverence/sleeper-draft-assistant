import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", async () => await import("../testing/mock-api"));
import { apiMock } from "../testing/mock-api";
import type { StorageInventory } from "../types";
import DataManagementPanel from "./DataManagementPanel.svelte";

const inventory: StorageInventory = {
  location: "application-data",
  sqliteStorage: true,
  rankingImports: 2,
  seasonProjectionImports: 0,
  adpImports: 1,
  rosRankingImports: 0,
  weeklyProjectionImports: 6,
  decisionSnapshots: 1200,
  draftPlans: 0,
  strategyInstructions: 0,
};

const ROW_LABELS = [
  "Draft rankings",
  "Season projections",
  "Draft ADP",
  "Season value rankings",
  "Weekly projections",
  "Decision history",
  "Assistant draft plans",
  "Draft instructions",
];

async function renderPanel(onResetComplete = vi.fn()) {
  render(DataManagementPanel, { onResetComplete });
  const line = await screen.findByRole("button", { name: /^Local data/ });
  return { line, onResetComplete };
}

describe("Local data line", () => {
  beforeEach(() => {
    apiMock.reset();
    apiMock.fetchStorageInventory.mockResolvedValue(inventory);
  });

  it("stays closed with one total until asked, and closing hides its controls again", async () => {
    const { line } = await renderPanel();
    await within(line).findByText("1,209 saved records on this device");
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Support report" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete all local app data" })).toBeNull();

    await fireEvent.click(line);
    expect(line.getAttribute("aria-expanded")).toBe("true");
    for (const label of ROW_LABELS) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Support report" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete all local app data" })).toBeTruthy();

    await fireEvent.click(line);
    expect(screen.queryByRole("button", { name: "Support report" })).toBeNull();
  });

  it("keeps the two-step clear and updates the closed line's total", async () => {
    apiMock.clearLocalDataCategory.mockResolvedValue({ deleted: 2, inventory: { ...inventory, rankingImports: 0 } });
    const { line } = await renderPanel();
    await within(line).findByText("1,209 saved records on this device");
    await fireEvent.click(line);

    expect((screen.getByRole("button", { name: "Clear all season projections" }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(screen.getByRole("button", { name: "Clear all draft rankings" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(apiMock.clearLocalDataCategory).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: "Clear all draft rankings" }));
    await fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(apiMock.clearLocalDataCategory).toHaveBeenCalledWith("rankings");
    await screen.findByText("Cleared 2 saved records.");
    expect(within(line).getByText("1,207 saved records on this device")).toBeTruthy();
  });

  it("only resets after DELETE is typed", async () => {
    const { line, onResetComplete } = await renderPanel();
    await fireEvent.click(line);
    await fireEvent.click(screen.getByRole("button", { name: "Delete all local app data" }));
    const confirm = screen.getByRole("button", { name: "Delete and reset" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(confirm.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    await fireEvent.click(confirm);
    await waitFor(() => expect(onResetComplete).toHaveBeenCalledOnce());
    expect(apiMock.resetLocalData).toHaveBeenCalledOnce();
  });

  it("says so on the closed line when counts cannot load", async () => {
    apiMock.fetchStorageInventory.mockRejectedValue(new Error("Could not load local data details."));
    const { line } = await renderPanel();
    await within(line).findByText("Could not load the saved record counts");
    await fireEvent.click(line);
    expect(screen.getByRole("alert").textContent).toContain("Could not load local data details.");
  });
});

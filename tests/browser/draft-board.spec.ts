import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./accessibility";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
  await page.route(/\/api\/drafts\/[^/]+\/events(?:\?|$)/, route => route.fulfill({
    contentType: "text/event-stream", body: ": frozen browser fixture\n\n",
  }));
});

async function loadDraft(page: Page, draftId: string) {
  await page.goto("/");
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(draftId);
  await page.getByPlaceholder("Optional").fill("2");
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
}

async function openEmergencyBoard(page: Page, draftId: string) {
  await loadDraft(page, draftId);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /emergency board/i }).click();
  await expect(page.getByRole("table", { name: "Draft picks by round and team" })).toBeVisible();
}

const strip = (page: Page) => page.getByRole("region", { name: "Draft state" });
const table = (page: Page) => page.getByRole("table", { name: "Draft picks by round and team" });
const roundRow = (page: Page, round: number) => table(page).getByRole("row", { name: new RegExp(`^Round ${round}\\b`) });
const teamColumn = (round: ReturnType<typeof roundRow>, slot: number) => round.getByRole("cell").nth(slot - 1);

test("a traded pick on the clock names its owner on the board and the strip", async ({ page }) => {
  await openEmergencyBoard(page, "browser-board-traded");
  await expect(strip(page).getByRole("heading")).toHaveText("On the clock");
  await expect(strip(page)).toContainText("Pick 3.01");
  const cell = teamColumn(roundRow(page, 3), 1);
  await expect(cell).toContainText("Now");
  await expect(cell).toContainText("Team 2");
  await expect(cell).toContainText("Traded");
  await expect(cell).not.toContainText("Team 1");
  await expect(cell).toHaveClass(/traded/);
  await page.getByRole("button", { name: "Show full draft board" }).click();
  await expect(teamColumn(roundRow(page, 3), 1)).toContainText("Team 2");
  await expectAccessible(page);
});

test("a linear draft keeps every round left to right and counts linear turns", async ({ page }) => {
  await openEmergencyBoard(page, "browser-board-linear");
  await expect(strip(page)).toContainText("Now 2.03");
  await expect(strip(page)).toContainText("3 picks away");
  await expect(strip(page)).toContainText("Your pick 3.02");
  await page.getByRole("button", { name: "Show full draft board" }).click();
  await expect(page.getByTitle(/^Round \d+: left to right$/)).toHaveCount(4);
  const cell = teamColumn(roundRow(page, 2), 3);
  await expect(cell).toContainText("2.03");
  await expect(cell).toContainText("Now");
});

test("a third-round reversal runs rounds two and three the same way", async ({ page }) => {
  await openEmergencyBoard(page, "browser-board-reversal");
  await expect(strip(page)).toContainText("Now 3.01");
  await expect(page.getByTitle("Round 3: right to left")).toBeVisible();
  await expect(page.getByTitle("Round 4: left to right")).toBeVisible();
  await expect(teamColumn(roundRow(page, 3), 4)).toContainText("Now");
});

test("the pre-draft board puts no pick on the clock", async ({ page }) => {
  await page.route("**/api/ai/status", route => route.fulfill({ json: { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } }));
  await page.route(/\/api\/drafts\/[^/]+\/state(?:\?|$)/, async route => {
    const appliedAt = new Date().toISOString();
    const payload = await (await route.fetch()).json();
    const summary = { source: "synthetic", season: "2026", scoring: "PPR", rowCount: 1, matchedCount: 1, unmatchedCount: 0, positions: [], unmatchedNames: [], unmatchedPlayers: [], warnings: [], appliedAt };
    await route.fulfill({ json: { ...payload, rankingImportSummary: summary, seasonProjectionImportSummary: summary, adpImportSummary: summary } });
  });
  await loadDraft(page, "browser-board-pre");
  await expect(strip(page)).toContainText("Draft not started");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(table(page)).toBeVisible();
  await expect(teamColumn(roundRow(page, 1), 1)).toContainText("Team 1");
  await expect(table(page).getByText("Now", { exact: true })).toHaveCount(0);
});

test("the board reads round, team, pick and player as a table under axe", async ({ page }) => {
  await openEmergencyBoard(page, "browser-board-linear");
  await expect(table(page).getByRole("columnheader", { name: "Round" })).toBeVisible();
  await expect(table(page).getByRole("columnheader", { name: /Team 2/ })).toBeVisible();
  await expect(table(page).getByRole("rowheader", { name: /^Round 2\b/ })).toBeVisible();
  const filled = teamColumn(roundRow(page, 2), 1);
  await expect(filled).toContainText("2.01");
  await expect(filled).toContainText("Test Quarterback");
  await expect(filled).toContainText("Team 1");
  await expectAccessible(page);
});

test("a remembered Team Manager opens without flashing the completed board", async ({ page }) => {
  const league = `browser-${randomUUID()}`;
  await loadDraft(page, league);
  await expect(page.getByRole("button", { name: "Manage team data" })).toBeVisible();
  await expect.poll(() => page.evaluate(id => window.localStorage.getItem(`workspaceMode:${id}`), league)).toBe("manage");

  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/leagues\/[^/]+\/team/, async route => {
    await held;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByText("Loading Sleeper roster...")).toBeVisible();
  await expect(page.getByRole("region", { name: "Draft board" })).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: "Manage team data" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Draft board" })).toHaveCount(0);
});

test("a remembered Team Manager falls back to the board when team data fails", async ({ page }) => {
  const league = `browser-${randomUUID()}`;
  await loadDraft(page, league);
  await expect(page.getByRole("button", { name: "Manage team data" })).toBeVisible();
  await page.route(/\/api\/leagues\/[^/]+\/team/, route => route.fulfill({ status: 500, json: { error: "Synthetic team failure." } }));
  await page.reload();
  await expect(page.getByRole("region", { name: "Draft board" })).toBeVisible();
});

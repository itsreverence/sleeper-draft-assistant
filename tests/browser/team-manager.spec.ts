import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNamesContainVisibleText } from "./accessibility";
import { routeLineup, type LineupScenario } from "./team-manager-fixture";

const ready = { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" };

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:15173" ? route.continue() : route.abort());
  await page.route("**/api/ai/status", route => route.fulfill({ json: ready }));
});

async function open(page: Page, scenario: LineupScenario, activity = false) {
  await routeLineup(page, scenario, activity);
  await page.goto("/");
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(`browser-${randomUUID()}`);
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await expect(page.getByRole("table", { name: "Starting lineup and reserves" })).toBeVisible();
}

const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("attention items state their count and each moves focus to the right place", async ({ page }) => {
  await open(page, "needs-look");
  await expect(page.getByRole("heading", { name: "3 things need a look" })).toBeVisible();
  const list = page.getByRole("list", { name: "3 things need a look" });
  await expect(list.getByRole("button")).toHaveText(["Marlon Ashby is on bye", "Devin Okafor is listed Questionable · Limited", "WR projections missing"]);
  await expect(page.getByText(/Trey Abernathy is listed/)).toHaveCount(0);

  const qbRow = page.getByRole("row", { name: /Marlon Ashby/ });
  await list.getByRole("button", { name: "Marlon Ashby is on bye" }).click();
  await expect(qbRow).toBeFocused();
  await expect(qbRow).toHaveCSS("outline-style", "solid");

  const dataItem = list.getByRole("button", { name: "WR projections missing" });
  await dataItem.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Manage team data" });
  const picker = drawer.getByLabel("Projection CSV", { exact: true });
  await expect(picker).toBeFocused();
  await expect(drawer.locator("label.file-button").last()).toBeInViewport();
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(dataItem).toBeFocused();
});

test("closing the drawer after an import resolves its item returns focus to Manage data", async ({ page }) => {
  await open(page, "needs-look");
  await page.getByRole("button", { name: "WR projections missing" }).click();
  const drawer = page.getByRole("dialog", { name: "Manage team data" });
  await drawer.getByText("Paste CSV instead", { exact: true }).click();
  await drawer.getByLabel("CSV for the selected position").fill("Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nTest Quarterback,BUF,30,20,250,2,0,3,15,0,0,15");
  await drawer.getByRole("button", { name: "Import QB", exact: true }).click();
  await expect(page.getByRole("button", { name: "WR projections missing" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Manage data", exact: true })).toBeFocused();
});

test("nothing to report shows one quiet line with a truthful fact", async ({ page }) => {
  await open(page, "all-clear");
  await expect(page.getByRole("heading", { name: "Lineup looks set" })).toBeVisible();
  await expect(page.getByText("9 starters, no byes or status flags, all projected for Week 8")).toBeVisible();
  await expect(page.getByRole("list", { name: /need/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Ask about/ })).toHaveCount(0);
  await expect(page.locator(".flagged")).toHaveCount(0);
  await expectAccessible(page);
  await expectNamesContainVisibleText(page);
});

test("preseason makes no claim about a lineup", async ({ page }) => {
  await open(page, "preseason");
  await expect(page.getByText("Preseason. Weekly lineup checks start with Week 1.")).toBeVisible();
  await expect(page.getByText("Lineup looks set")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Draft status" })).toContainText("Preseason · Synthetic Sluggers · PPR");
  await expect(page.getByRole("button", { name: "Lineup", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Depth", exact: true })).toBeVisible();
});

test("an unknown week asks for one, opening the week field, rather than clearing the lineup", async ({ page }) => {
  await open(page, "unknown-week");
  await expect(page.getByText("Lineup looks set")).toHaveCount(0);
  await page.getByRole("button", { name: "Current week unknown. Choose one" }).click();
  await expect(page.getByRole("dialog", { name: "Manage team data" }).getByLabel("Week", { exact: true })).toBeFocused();
});

test("Ask on a flagged row composes an editable question, focused and unsent", async ({ page }) => {
  let asked = 0;
  await page.route(/\/api\/leagues\/[^/]+\/team\/ask(?:\?|$)/, route => { asked += 1; return route.fulfill({ json: { answer: "Synthetic answer." } }); });
  await open(page, "needs-look");
  const row = page.getByRole("row", { name: /Devin Okafor/ });
  await expect(row).toHaveClass(/flagged/);
  await expect(page.getByRole("row", { name: /Jonah Whitfield/ })).not.toHaveClass(/flagged/);
  await row.getByRole("button", { name: "Ask about Devin Okafor" }).click();
  const composer = page.getByRole("textbox", { name: "Ask Assistant about your team" });
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("Sleeper lists Devin Okafor as Questionable · Limited. Should I change anything at RB?");
  await expect(composer).toBeInViewport();
  await page.waitForTimeout(200);
  expect(asked).toBe(0);
  await expect(page.getByRole("log", { name: "Team conversation" })).toHaveCount(0);
  await composer.press("Enter");
  await expect(page.getByText("Synthetic answer.")).toBeVisible();
  await expect(composer).toBeInViewport({ ratio: 1 });
  expect(asked).toBe(1);
});

test("reserves open from the keyboard, keep focus, and never raise an attention item", async ({ page }) => {
  await open(page, "needs-look");
  const toggle = page.getByRole("button", { name: "Bench (6) · Injured reserve (1)" });
  await expect(page.getByText("Owen Castellano")).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toBeFocused();
  await expect(page.getByText("Owen Castellano")).toBeVisible();
  await expect(page.getByRole("row", { name: /Trey Abernathy/ })).not.toHaveClass(/flagged/);
  await expect(page.getByRole("heading", { name: "3 things need a look" })).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press("Space");
  await expect(page.getByText("Owen Castellano")).toHaveCount(0);
});

test("market activity is one line when real, keeps its details, and is absent otherwise", async ({ page }) => {
  await open(page, "all-clear", true);
  const line = page.getByRole("button", { name: /Market activity/ });
  await expect(line).toContainText("Team 4 added Jace Mingo · Team 7 traded for Dale Henning");
  await expect(line).toContainText("View details");
  await line.click();
  await expect(page.getByRole("heading", { name: "Market signals" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask Assistant about market activity" })).toBeVisible();
  await expectAccessible(page);
});

test("without activity there is no market row", async ({ page }) => {
  await open(page, "all-clear", false);
  await expect(page.getByRole("button", { name: /Market activity/ })).toHaveCount(0);
  await expect(page.getByText("Market activity")).toHaveCount(0);
});

test("the lineup survives a long conversation: capped thread, lineup one scroll away", async ({ page }) => {
  const longAnswer = Array.from({ length: 40 }, (_, i) => `Synthetic answer line ${i + 1}.`).join("\n\n");
  await page.route(/\/api\/leagues\/[^/]+\/team\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: longAnswer } }));
  await open(page, "needs-look");
  const table = page.getByRole("table", { name: "Starting lineup and reserves" });
  const composer = page.getByRole("textbox", { name: "Ask Assistant about your team" });
  for (const question of ["First", "Second", "Third"]) {
    await composer.fill(question);
    await composer.press("Enter");
    await expect(page.getByText(new RegExp(`^${question}$`))).toBeVisible();
  }
  await expect(page.getByText("Synthetic answer line 40.")).toHaveCount(3);
  await expect(composer).toBeInViewport({ ratio: 1 });
  const thread = page.getByRole("log", { name: "Team conversation" });
  const threadHeight = await thread.evaluate(node => node.clientHeight);
  expect(threadHeight).toBeLessThanOrEqual(460);
  expect(await thread.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  const tableBottom = await table.evaluate(node => node.getBoundingClientRect().bottom + window.scrollY);
  const threadTop = await thread.evaluate(node => node.getBoundingClientRect().top + window.scrollY);
  expect(threadTop).toBeGreaterThan(tableBottom);
  await page.getByRole("button", { name: "Conversation" }).click();
  await expect(thread).toHaveCount(0);
  await expect(page.getByText("Synthetic answer line 40.")).toHaveCount(0);
  await page.getByRole("button", { name: "Conversation" }).click();
  await expect(page.getByText("Synthetic answer line 40.")).toHaveCount(3);
});

test("a real attention change is announced once, and an unchanged refresh stays silent", async ({ page }) => {
  await open(page, "needs-look");
  const live = page.locator('.team-workspace p[aria-live="polite"]');
  await expect(live).toHaveText("");
  await page.unroute(/\/api\/leagues\/[^/]+\/team(?:\?|$)/);
  await routeLineup(page, "needs-look");
  await page.getByRole("button", { name: "Refresh team data" }).click();
  await expect(page.getByRole("button", { name: "Refresh team data" })).toBeEnabled();
  await expect(live).toHaveText("");
  await page.unroute(/\/api\/leagues\/[^/]+\/team(?:\?|$)/);
  await routeLineup(page, "all-clear");
  await page.getByRole("button", { name: "Refresh team data" }).click();
  await expect(live).toHaveText("Lineup looks set.");
});

test("a pending retry keeps the failed-refresh note until new data arrives", async ({ page }) => {
  await open(page, "all-clear");
  const refresh = page.getByRole("button", { name: "Refresh team data" });
  const teamRoute = /\/api\/leagues\/[^/]+\/team(?:\?|$)/;
  await page.unroute(teamRoute);
  await page.route(teamRoute, route => route.fulfill({ status: 503, json: { error: "Synthetic outage." } }));
  await refresh.click();
  await expect(page.locator(".attention.note").filter({ hasText: "Nothing flagged, but the last refresh failed." })).toBeVisible();

  await page.unroute(teamRoute);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = () => {};
  const arrived = new Promise<void>(resolve => { requested = resolve; });
  await routeLineup(page, "all-clear");
  await page.route(teamRoute, async route => { requested(); await held; await route.fallback(); });
  await refresh.click();
  await arrived;
  await expect(page.getByText("Lineup looks set")).toHaveCount(0);
  await expect(page.locator(".attention.note").filter({ hasText: "Nothing flagged, but the last refresh failed." })).toBeVisible();

  release();
  await expect(page.getByText("Lineup looks set").first()).toBeVisible();
});

test("every part of Team Manager fits and works at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await open(page, "needs-look", true);
  expect(await fits(page)).toBe(true);
  await expect(page.getByRole("img", { name: "On bye in Week 8" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage data", exact: true })).toBeVisible();
  const row = page.getByRole("row", { name: /Devin Okafor/ });
  await row.getByRole("button", { name: "Ask about Devin Okafor" }).click();
  await expect(page.getByRole("textbox", { name: "Ask Assistant about your team" })).toBeFocused();
  await page.getByRole("button", { name: /^Bench \(6\)/ }).click();
  await page.getByRole("button", { name: /Market activity/ }).click();
  expect(await fits(page)).toBe(true);
  const header = await page.getByRole("columnheader", { name: "Player", exact: true }).boundingBox();
  expect(header!.width).toBeGreaterThan(100);
  await expectAccessible(page);
  await expectNamesContainVisibleText(page);
});

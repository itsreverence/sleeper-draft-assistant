import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { Position, TeamPayload } from "../../apps/web/src/lib/types";
import { expectAccessible, expectNamesContainVisibleText } from "./accessibility";
import { dataPayload, routeData, type LineupScenario } from "./team-manager-fixture";

const ALL: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const DAY = 86_400_000;

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:15173" ? route.continue() : route.abort());
  await page.route("**/api/ai/status", route => route.fulfill({ json: { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } }));
});

function keepPositions(draft: TeamPayload, positions: Position[]) {
  const summary = draft.weeklyProjectionSummary!;
  draft.weeklyProjectionSummary = { ...summary, positions, positionResults: summary.positionResults.filter(result => positions.includes(result.position)) };
  for (const player of [...draft.state.roster.starters.map(slot => slot.player!), ...draft.state.roster.bench]) {
    if (!positions.includes(player.position)) { player.projectionSource = "sleeper_search_rank"; player.weeklyProjectedPoints = null; }
  }
}

function age(draft: TeamPayload, days: number) {
  const appliedAt = new Date(Date.now() - days * DAY).toISOString();
  const summary = draft.weeklyProjectionSummary!;
  draft.weeklyProjectionSummary = { ...summary, appliedAt, positionResults: summary.positionResults.map(result => ({ ...result, appliedAt })) };
}

async function openDrawer(page: Page, scenario: LineupScenario, change?: Parameters<typeof routeData>[2]) {
  await routeData(page, scenario, change);
  await page.goto("/");
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(`browser-${randomUUID()}`);
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await page.getByRole("button", { name: "Manage data", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Manage team data" });
  await expect(drawer).toBeVisible();
  return drawer;
}

const STATES: Array<{ name: string; scenario: LineupScenario; change?: Parameters<typeof routeData>[2]; title: string; primary: number }> = [
  { name: "nothing loaded", scenario: "all-clear", change: draft => { draft.weeklyProjectionSummary = null; }, title: "Week 8 has no projections", primary: 1 },
  { name: "partly loaded", scenario: "all-clear", change: draft => keepPositions(draft, ["QB", "RB", "WR", "TE"]), title: "Week 8 is missing K and DST projections", primary: 1 },
  { name: "all loaded", scenario: "all-clear", title: "Week 8 projections are loaded", primary: 0 },
  { name: "old files", scenario: "all-clear", change: draft => age(draft, 5), title: "Week 8 projections are 5 days old", primary: 1 },
  { name: "preseason", scenario: "preseason", title: "Regular-season weekly advice is not active yet", primary: 0 },
  { name: "other season", scenario: "all-clear", change: draft => { draft.weeklyProjectionSummary = { ...draft.weeklyProjectionSummary!, season: "2025" }; }, title: "Saved projections are for 2025", primary: 1 },
];

for (const { name, scenario, change, title, primary } of STATES) {
  test(`${name} states one true lead and fits at every width`, async ({ page }) => {
    const drawer = await openDrawer(page, scenario, change);
    const lead = drawer.getByRole("region", { name: title, exact: true });
    await expect(lead).toBeVisible();
    await expect(lead.locator(".btn-primary")).toHaveCount(primary);
    await expectAccessible(page);
    await expectNamesContainVisibleText(page);
    const body = drawer.getByRole("region", { name: "Manage team data content" });
    for (const width of [1280, 800, 480, 320]) {
      await page.setViewportSize({ width, height: 700 });
      expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth), `body fits at ${width}px`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });
}

test("the lead file control opens from the keyboard, imports into the stated week, and keeps focus in the drawer", async ({ page }) => {
  const drawer = await openDrawer(page, "all-clear", draft => keepPositions(draft, ["QB", "RB", "WR", "TE"]));
  const lead = drawer.getByRole("region", { name: "Week 8 is missing K and DST projections", exact: true });
  const picker = lead.getByLabel("Choose K and DST files", { exact: true });
  await drawer.getByRole("button", { name: "Change week" }).focus();
  await page.keyboard.press("Tab");
  await expect(picker).toBeFocused();
  await expect(lead.locator("label.file-button")).toHaveCSS("outline-style", "solid");
  for (const key of ["Enter", "Space"]) {
    const opened = page.waitForEvent("filechooser");
    await page.keyboard.press(key);
    await (await opened).setFiles([]);
    await expect(picker).toBeFocused();
  }
  await picker.setInputFiles([
    { name: "FantasyPros_Fantasy_Football_Projections_K.csv", mimeType: "text/csv", buffer: Buffer.from("Player,Team,FG,FGA,XPT,FPTS\nSynthetic Kicker,PHI,2,3,3,9") },
    { name: "FantasyPros_Fantasy_Football_Projections_DST.csv", mimeType: "text/csv", buffer: Buffer.from("Player,Team,SACK,INT,FR,FF,TD,SAFETY,PA,YDS_AGN,FPTS\nSynthetic Defense,BAL,3,1,1,1,0,0,20,300,8") },
    { name: "FantasyPros_Fantasy_Football_Projections_FLEX.csv", mimeType: "text/csv", buffer: Buffer.from("x") },
  ]);
  await expect(lead.getByText(/^Ignored .*FLEX\.csv/)).toBeVisible();
  let body: { week: number; season: string } | null = null;
  await page.route("**/projections/weekly/import?*", async route => {
    body = route.request().postDataJSON();
    const fresh = dataPayload(await (await route.fetch({ url: route.request().url().replace(/\/projections\/weekly\/import.*/, "/team") , method: "GET", postData: undefined })).json() as TeamPayload, "all-clear");
    await route.fulfill({ json: { ...fresh, summary: fresh.weeklyProjectionSummary } });
  });
  await lead.getByRole("button", { name: "Import 2 files" }).click();
  await expect(drawer.getByRole("heading", { name: "Week 8 projections are loaded" })).toBeFocused();
  expect(body).toMatchObject({ season: "2026", week: 8 });
  await expect(drawer.locator(".lead .btn-primary")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Manage data", exact: true })).toBeFocused();
});

test("a rejected lead import stays on the lead, keeps the files, and doesn't read as done", async ({ page }) => {
  const drawer = await openDrawer(page, "all-clear", draft => keepPositions(draft, ["QB", "RB", "WR", "TE", "K"]));
  const lead = drawer.getByRole("region", { name: "Week 8 is missing DST projections", exact: true });
  await lead.getByLabel("Choose DST file", { exact: true }).setInputFiles({ name: "renamed.csv", mimeType: "text/csv", buffer: Buffer.from("bad") });
  await page.route("**/projections/weekly/import?*", route => route.fulfill({ status: 500, json: { error: "Synthetic import failure." } }));
  await lead.getByRole("button", { name: "Import DST" }).click();
  await expect(lead.getByRole("alert")).toHaveText("Synthetic import failure.");
  await expect(lead.getByText("renamed.csv")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Week 8 is missing DST projections" })).toBeVisible();
});

test("a failed import over complete files can't read as loaded, and closing reopens the same truth", async ({ page }) => {
  const drawer = await openDrawer(page, "all-clear");
  await drawer.getByRole("button", { name: /^Weekly projections/ }).click();
  await drawer.getByText("Paste CSV instead", { exact: true }).click();
  await drawer.getByLabel("CSV for the selected position").fill("bad");
  await page.route("**/projections/weekly/import?*", route => route.fulfill({ status: 500, json: { error: "Synthetic import failure." } }));
  await drawer.getByRole("button", { name: "Import QB", exact: true }).click();
  const lead = drawer.getByRole("region", { name: "Weekly projections didn't update", exact: true });
  await expect(lead.getByRole("alert")).toHaveText("Synthetic import failure.");
  await expect(lead).not.toContainText("projections are loaded");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Manage data", exact: true }).click();
  await expect(drawer.getByRole("region", { name: "Weekly projections didn't update", exact: true })).toBeVisible();
});

test("repairing a failed import over complete files stays actionable until a replacement is accepted", async ({ page }) => {
  const drawer = await openDrawer(page, "all-clear");
  await drawer.getByRole("button", { name: /^Weekly projections/ }).click();
  await drawer.getByText("Paste CSV instead", { exact: true }).click();
  await drawer.getByLabel("CSV for the selected position").fill("bad");
  await page.route("**/projections/weekly/import?*", route => route.fulfill({ status: 500, json: { error: "Synthetic import failure." } }));
  await drawer.getByRole("button", { name: "Import QB", exact: true }).click();
  const lead = drawer.getByRole("region", { name: "Weekly projections didn't update", exact: true });
  await lead.getByLabel("Choose CSV files", { exact: true }).setInputFiles({ name: "FantasyPros_Fantasy_Football_Projections_QB.csv", mimeType: "text/csv", buffer: Buffer.from("repair") });
  await expect(lead.getByText("FantasyPros_Fantasy_Football_Projections_QB.csv")).toBeVisible();
  await expect(lead.locator(".btn-primary")).toHaveCount(1);
  await expect(drawer.getByRole("heading", { name: /projections are loaded/ })).toHaveCount(0);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.unroute("**/projections/weekly/import?*");
  await page.route("**/projections/weekly/import?*", async route => {
    await held;
    await route.fulfill({ status: 500, json: { error: "Synthetic import failure." } });
  });
  await lead.locator(".btn-primary").click();
  await expect(drawer.getByRole("heading", { name: "Weekly projections didn't update" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /projections are loaded/ })).toHaveCount(0);
  release();
  await expect(lead.getByRole("alert")).toHaveText("Synthetic import failure.");
});

test("a failure stays with its own week, and a typed week's failure doesn't blame the week on screen", async ({ page }) => {
  const drawer = await openDrawer(page, "all-clear", (draft, url) => {
    const week = Number(url.searchParams.get("week")) || 8;
    draft.weeklyProjectionSummary = { ...draft.weeklyProjectionSummary!, week };
    for (const player of [...draft.state.roster.starters.map(slot => slot.player!), ...draft.state.roster.bench]) player.weeklyProjectionWeek = week;
  });
  await page.route("**/projections/weekly/import?*", route => route.fulfill({ status: 500, json: { error: "Synthetic import failure." } }));
  await drawer.getByRole("button", { name: /^Weekly projections/ }).click();
  await drawer.getByText("Paste CSV instead", { exact: true }).click();
  const weekField = drawer.locator("[data-line='weekly'] input[type='number']");
  const failFor = async () => {
    await drawer.getByLabel("CSV for the selected position").fill("bad");
    await drawer.getByRole("button", { name: "Import QB", exact: true }).click();
  };
  await weekField.fill("6");
  await failFor();
  await expect(drawer.getByText("Week 6 didn't update: Synthetic import failure.").first()).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Week 8 projections are loaded" })).toBeVisible();
  await weekField.fill("8");
  await failFor();
  await expect(drawer.getByRole("heading", { name: "Weekly projections didn't update" })).toBeVisible();
  await weekField.fill("6");
  await drawer.getByRole("button", { name: "Load selected week" }).click();
  await expect(drawer.getByRole("heading", { name: "Weekly projections didn't update" })).toBeVisible();
  await weekField.fill("8");
  await drawer.getByRole("button", { name: "Load selected week" }).click();
  await expect(drawer.getByRole("heading", { name: "Weekly projections didn't update" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /projections are loaded/ })).toHaveCount(0);
});

test("the week shown is the accepted payload's: a pending load claims nothing and a pinned week offers the way back", async ({ page }) => {
  const drawer = await openDrawer(page, "all-clear", (draft, url) => {
    const week = Number(url.searchParams.get("week")) || 8;
    draft.weeklyProjectionSummary = { ...draft.weeklyProjectionSummary!, week };
    for (const player of [...draft.state.roster.starters.map(slot => slot.player!), ...draft.state.roster.bench]) player.weeklyProjectionWeek = week;
  });
  await drawer.getByRole("button", { name: "Change week" }).click();
  const weekField = drawer.getByLabel("Week", { exact: true });
  await expect(weekField).toBeFocused();
  await weekField.fill("6");
  await expect(drawer.getByText("Week 8 is on screen. Load selected week to switch, or import files into Week 6.")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Week 8 projections are loaded" })).toBeVisible();

  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/leagues\/[^/]+\/team(?:\?|$)/, async route => { await held; await route.fallback(); });
  await drawer.getByRole("button", { name: "Load selected week" }).click();
  await expect(drawer.getByRole("heading", { name: "Checking weekly data", exact: true })).toBeVisible();
  release();
  await expect(drawer.getByRole("heading", { name: "Week 6 projections are loaded" })).toBeVisible();
  const lead = drawer.getByRole("region", { name: "Week 6 projections are loaded" });
  await expect(lead.locator(".dot")).toHaveCount(0);
  await expect(lead.getByText(/Viewing Week 6; Sleeper currently reports Week 8/)).toBeVisible();
  await lead.getByRole("button", { name: "Back to Week 8" }).click();
  await expect(drawer.getByRole("heading", { name: "Week 8 projections are loaded" })).toBeVisible();
  await expect(weekField).toHaveValue("8");
});

test("a failed refresh removes all clear from the lead", async ({ page }) => {
  await routeData(page, "all-clear");
  await page.goto("/");
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(`browser-${randomUUID()}`);
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await expect(page.getByRole("table", { name: "Starting lineup and reserves" })).toBeVisible();
  const teamRoute = /\/api\/leagues\/[^/]+\/team(?:\?|$)/;
  await page.unroute(teamRoute);
  await page.route(teamRoute, route => route.fulfill({ status: 503, json: { error: "Synthetic outage." } }));
  await page.getByRole("button", { name: "Refresh team data" }).click();
  await expect(page.locator(".attention.note").filter({ hasText: "the last refresh failed" })).toBeVisible();
  await page.getByRole("button", { name: "Manage data", exact: true }).click();
  const lead = page.getByRole("region", { name: "Can't confirm Week 8", exact: true });
  await expect(lead).toContainText("The last refresh failed. This is earlier Sleeper data.");
  await expect(lead.locator(".dot")).toHaveCount(0);
});

test("opening lines scrolls the drawer body alone, with the header and page in place at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const drawer = await openDrawer(page, "all-clear", draft => keepPositions(draft, ALL.slice(0, 4)));
  for (const name of ["Weekly projections", "Season value rankings", "Coverage"]) await drawer.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  const body = drawer.getByRole("region", { name: "Manage team data content" });
  expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await body.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
  await expect(drawer.getByRole("button", { name: "Close team data" })).toBeInViewport();
  await expect(drawer.getByRole("meter", { name: "Roster projection coverage" })).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectAccessible(page);
});

test("a schedule outage item opens Coverage with its warning, then returns focus", async ({ page }) => {
  await routeData(page, "all-clear", draft => { draft.state.scheduleStatus = { available: false, week: 8 }; });
  await page.goto("/");
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(`browser-${randomUUID()}`);
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  const item = page.getByRole("button", { name: "NFL schedule unavailable, so some byes are unknown" });
  await item.click();
  const drawer = page.getByRole("dialog", { name: "Manage team data" });
  const coverage = drawer.getByRole("region", { name: "Coverage", exact: true });
  await expect(coverage.getByRole("button", { name: /^Coverage/ })).toBeFocused();
  await expect(coverage.getByText(/^NFL schedule unavailable; imported draft byes/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(item).toBeFocused();
});

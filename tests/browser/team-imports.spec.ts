import { expectConversationBehavior } from "./conversation-behavior";
import { expectResponseTable, tableAnswer } from "./response-table";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./accessibility";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
});

async function connect(page: Page, league = `browser-${randomUUID()}`) {
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(league);
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manage team data" })).toBeVisible();
  return league;
}

function panels(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Manage team data" });
  return {
    drawer,
    weekly: drawer.locator("article").filter({ has: page.getByRole("heading", { name: "Weekly projections", exact: true }) }),
  };
}

const weeklyCsv = (points: number) => `Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nTest Quarterback,BUF,30,20,250,2,0,3,15,0,0,${points}`;

test("pasting weekly CSV clears the native file selection and allows reselecting the same file", async ({ page }) => {
  await page.goto("/");
  await connect(page);
  await page.getByRole("button", { name: "Manage team data" }).click();
  const { weekly } = panels(page);
  const picker = weekly.getByLabel("Projection CSV", { exact: true });
  const file = { name: "synthetic-QB.csv", mimeType: "text/csv", buffer: Buffer.from(weeklyCsv(15)) };
  await picker.setInputFiles(file);
  await expect(weekly.getByText("synthetic-QB.csv")).toBeVisible();
  await weekly.getByText("Paste CSV instead", { exact: true }).click();
  await weekly.getByLabel("CSV for the selected position").fill(weeklyCsv(17));
  await expect(picker).toHaveValue("");
  await expect.poll(() => picker.evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  const pasted = page.waitForResponse(r => r.url().includes("/projections/weekly/import") && r.request().method() === "POST");
  await weekly.getByRole("button", { name: "Import QB", exact: true }).click();
  expect((await (await pasted).json()).state.roster.starters[0].player.weeklyProjectedPoints).toBe(17);
  await expect(weekly.getByText("1 matched for 2026 Week 2")).toBeVisible();
  await expect(picker).toHaveValue("");
  await picker.setInputFiles(file);
  await expect(weekly.getByText("synthetic-QB.csv")).toBeVisible();
  const imported = page.waitForResponse(r => r.url().includes("/projections/weekly/import") && r.request().method() === "POST");
  await weekly.getByRole("button", { name: "Import QB", exact: true }).click();
  expect((await (await imported).json()).state.roster.starters[0].player.weeklyProjectedPoints).toBe(15);
});

test("a delayed import response cannot resurrect reset data or replace a newly connected team", async ({ page }) => {
  await page.goto("/");
  const oldLeague = await connect(page);
  await page.getByRole("button", { name: "Manage team data" }).click();
  const { drawer, weekly } = panels(page);
  let release!: () => void;
  let imported!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const stored = new Promise<void>(resolve => { imported = resolve; });
  // Hold only delivery: parsing and persistence finish before reset happens.
  await page.route("**/projections/weekly/import?*", async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    imported();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await weekly.getByText("Paste CSV instead", { exact: true }).click();
    await weekly.getByLabel("CSV for the selected position").fill(weeklyCsv(99));
    await weekly.getByRole("button", { name: "Import QB", exact: true }).click();
    await stored;
    await drawer.getByRole("button", { name: "Close team data" }).click();
    await page.getByTitle("Open settings", { exact: true }).click();
    await page.getByRole("button", { name: "Delete all local app data" }).click();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Delete and reset" }).click();
    await expect(page.getByLabel("Sleeper username")).toBeVisible();
    const newLeague = await connect(page);
    await expect(page.getByRole("heading", { name: `Team ${newLeague}`, exact: true })).toBeVisible();
    const delivered = page.waitForEvent("requestfinished", {
      predicate: request => request.url().includes("/projections/weekly/import"),
    });
    release();
    await delivered;
    // Allow fetch continuation and Svelte's render to settle after delivery.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: `Team ${newLeague}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Manage team data" }).click();
    await expect(weekly.getByRole("button", { name: "Clear week" })).toHaveCount(0);
    // Reconnect the original league after a reload: the reset removed its saved
    // import too, not merely the currently displayed summary.
    await page.goto("/");
    await page.getByTitle("Switch league or draft").click();
    await connect(page, oldLeague);
    await page.getByRole("button", { name: "Manage team data" }).click();
    await expect(weekly.getByRole("button", { name: "Clear week" })).toHaveCount(0);
  } finally {
    release();
  }
});

test("ROS file import survives reload, replaces, and clears through the real API", async ({ page }) => {
  // Unique league prevents mutable imports leaking across tests or repeats.
  const league = `browser-${randomUUID()}`;
  await page.goto("/");
  await connect(page, league);
  await page.getByRole("button", { name: "Manage team data" }).click();
  const drawer = page.getByRole("dialog", { name: "Manage team data" });
  const ros = drawer.locator("article").filter({ has: page.getByRole("heading", { name: "Season value rankings" }) });
  await ros.getByLabel("Choose CSV").setInputFiles({
    name: "synthetic-adp.csv", mimeType: "text/csv",
    buffer: Buffer.from('"Rank","Player","Team","Bye","POS","Sleeper","RTSports","AVG","Real-Time (?)"'),
  });
  await ros.getByRole("button", { name: "Import season value rankings", exact: true }).click();
  await expect(ros.getByText("This looks like a FantasyPros ADP file. For season value rankings, choose the Overall ROS ECR export, or Overall Draft ECR until ROS is available, matching your league's scoring format.", { exact: true })).toBeVisible();
  const csv = (rank: number) => `RK,PLAYER NAME,TEAM,POS,SOS SEASON,SOS PLAYOFFS,ECR VS. ADP\n${rank},Test Quarterback,BUF,QB1,3 out of 5 stars,3 out of 5 stars,0`;
  await ros.getByLabel("Choose CSV").setInputFiles({ name: "synthetic-ros.csv", mimeType: "text/csv", buffer: Buffer.from(csv(1)) });
  await ros.getByRole("button", { name: "Import season value rankings", exact: true }).click();
  await expect(ros.getByText("ROS ECR · 1 matched · 2026 PPR")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Manage team data" }).click();
  await expect(ros.getByText("ROS ECR · 1 matched · 2026 PPR")).toBeVisible();
  await ros.getByLabel("Choose CSV").setInputFiles({ name: "synthetic-ros.csv", mimeType: "text/csv", buffer: Buffer.from(csv(2)) });
  const replaced = page.waitForResponse(r => r.url().includes("/rankings/ros/import") && r.request().method() === "POST");
  await ros.getByRole("button", { name: "Replace season value rankings" }).click();
  const payload = await (await replaced).json();
  expect(payload.state.roster.starters[0].player.rosRank).toBe(2);
  await ros.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(ros.getByText("Long-term waiver and roster value")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Manage team data" }).click();
  await expect(ros.getByText("Long-term waiver and roster value")).toBeVisible();
});

test("weekly uploads replace only the selected week and clearing survives reload", async ({ page }, testInfo) => {
  await page.goto("/");
  await connect(page);
  await page.getByRole("button", { name: "Manage team data" }).click();
  const { drawer, weekly } = panels(page);
  async function checkRoster(points: number | null) {
    await drawer.getByRole("button", { name: "Close team data" }).click();
    if (points === null) {
      await expect(page.getByText("24.5 pts", { exact: true })).toHaveCount(0);
    } else {
      const projection = page.getByText(`${points} pts`, { exact: true });
      // Compact layout intentionally hides the projection column, but its
      // rendered value must still track the selected payload.
      await expect(projection).toBeAttached();
      if (testInfo.project.name === "desktop") await expect(projection).toBeVisible();
    }
    await page.getByRole("button", { name: "Manage team data" }).click();
  }
  await expect(weekly.getByLabel("Season", { exact: true })).toHaveValue("2026");
  await expect(weekly.getByLabel("Week", { exact: true })).toHaveValue("2");
  async function upload(points: number) {
    await weekly.getByLabel("Projection CSV", { exact: true }).setInputFiles({
      name: "FantasyPros_Fantasy_Football_Projections_QB.csv", mimeType: "text/csv", buffer: Buffer.from(weeklyCsv(points)),
    });
    const response = page.waitForResponse(r => r.url().includes("/projections/weekly/import") && r.request().method() === "POST");
    await weekly.getByRole("button", { name: "Import QB", exact: true }).click();
    const result = await (await response).json();
    expect(result.error).toBeUndefined();
    expect(result.state.roster.starters[0].player.weeklyProjectedPoints).toBe(points);
    await expect(weekly.getByText(/1 matched for 2026 Week/)).toBeVisible();
    await checkRoster(points);
  }
  await upload(21.5);
  await upload(24.5);
  await weekly.getByLabel("Week", { exact: true }).fill("1");
  await weekly.getByRole("button", { name: "Load selected week" }).click();
  await expect(weekly.getByRole("button", { name: "Clear week" })).toHaveCount(0);
  await upload(10.5);
  await weekly.getByLabel("Week", { exact: true }).fill("2");
  const loaded = page.waitForResponse(r => r.url().includes("/team?") && r.url().includes("week=2"));
  await weekly.getByRole("button", { name: "Load selected week" }).click();
  expect((await (await loaded).json()).state.roster.starters[0].player.weeklyProjectedPoints).toBe(24.5);
  await checkRoster(24.5);
  await weekly.getByRole("button", { name: "Clear week" }).click();
  await expect(weekly.getByRole("button", { name: "Clear week" })).toHaveCount(0);
  await checkRoster(null);
  await page.reload();
  await page.getByRole("button", { name: "Manage team data" }).click();
  await expect(weekly.getByRole("button", { name: "Clear week" })).toHaveCount(0);
  await weekly.getByLabel("Week", { exact: true }).fill("1");
  const retained = page.waitForResponse(r => r.url().includes("/team?") && r.url().includes("week=1"));
  await weekly.getByRole("button", { name: "Load selected week" }).click();
  expect((await (await retained).json()).state.roster.starters[0].player.weeklyProjectedPoints).toBe(10.5);
  await expect(weekly.getByText("1 matched for 2026 Week 1")).toBeVisible();
  await checkRoster(10.5);
});

test("team data is keyboard accessible and collapsed imports stay outside the tab order", async ({ page }) => {
  await page.goto("/");
  await connect(page);
  const opener = page.getByRole("button", { name: "Manage team data" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const { drawer, weekly } = panels(page);
  const close = drawer.getByRole("button", { name: "Close team data" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  const disclosure = weekly.getByText("Paste CSV instead", { exact: true });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(weekly.getByLabel("CSV for the selected position")).toBeFocused();
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(weekly.getByLabel("CSV for the selected position")).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("connection, Team Manager, and import controls meet automated accessibility checks", async ({ page }) => {
  await page.route("**/api/ai/status", route => route.fulfill({ json: { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } }));
  await page.goto("/");
  await expectAccessible(page);
  await connect(page);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Manage team data" }).click();
  await expect(panels(page).drawer).toBeVisible();
  await expectAccessible(page);
});


test("bye markers announce the selected week and remain visible at every viewport", async ({ page }) => {
  await page.goto("/");
  await connect(page);
  await page.getByRole("button", { name: "Manage team data" }).click();
  const { drawer, weekly } = panels(page);
  await weekly.getByLabel("Week", { exact: true }).fill("9");
  await weekly.getByRole("button", { name: "Load selected week" }).click();
  await drawer.getByRole("button", { name: "Close team data" }).click();
  await expect(page.getByRole("img", { name: "On bye in Week 9", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "On bye in Week 9", exact: true })).toHaveText("BYE");
});

test("Team Manager answers contain wide Markdown tables inside the chat bubble", async ({ page }, testInfo) => {
  await page.route("**/api/ai/status", route => route.fulfill({ json: {
    id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available",
  } }));
  await page.route(/\/api\/leagues\/[^/]+\/team\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: tableAnswer } }));
  await page.goto("/");
  await connect(page, `browser-t${testInfo.project.name[0]}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("textbox", { name: "Ask Codex about your team" }).fill("Show a table of lineup options.");
  await page.getByRole("button", { name: "Ask Codex", exact: true }).click();
  await expectResponseTable(page);
});

test("Team Manager cancel, newest-message scrolling, focus and follow-up history", async ({ page }) => {
  await page.route("**/api/ai/status", route => route.fulfill({ json: {
    id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available",
  } }));
  await page.goto("/");
  await connect(page);
  await expectConversationBehavior(page, {
    route: /\/api\/leagues\/[^/]+\/team\/ask(?:\?|$)/,
    inputName: "Ask Codex about your team", sendName: "Ask Codex", logName: "Team conversation", inputKey: "Control+Enter",
  });
});

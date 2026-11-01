import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNamesContainVisibleText } from "./accessibility";

const WIDTHS = [1280, 800, 480, 320];

async function expectFits(page: Page, width: number) {
  await page.setViewportSize({ width, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `page fits at ${width}px`).toBe(true);
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Application settings" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Sleeper username")).toBeVisible();
});

test("home says what the app does and keeps every way in at every width", async ({ page }) => {
  await expect(page.getByText("Draft and lineup help for Sleeper. The app stores its data on this device; Assistant requests go through your Codex account.", { exact: true })).toBeVisible();
  for (const name of ["Find leagues", "Paste a league URL", "Paste a draft ID", "Try a demo draft"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Loads a sample board for testing only, not a source of player values.", { exact: true })).toBeVisible();
  for (const width of WIDTHS) await expectFits(page, width);
  await expectAccessible(page);
  await expectNamesContainVisibleText(page);
});

test("the home line leaves once a draft is open, and the draft opens at its top", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole("button", { name: "Paste a league URL", exact: true }).click();
  const demo = page.getByRole("button", { name: "Try a demo draft", exact: true });
  await demo.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await demo.click();
  await expect(page.getByLabel("Sleeper username")).toBeHidden();
  await expect(page.getByText(/stores its data on this device/)).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("local data stays out of the tab order until its line is opened", async ({ page }) => {
  const dialog = await openSettings(page);
  const line = dialog.getByRole("button", { name: /^Local data/ });
  const report = dialog.getByRole("button", { name: "Support report", exact: true });
  await expect(line).toContainText("saved records on this device");
  await expect(line).toHaveAttribute("aria-expanded", "false");
  await expect(report).toBeHidden();

  await line.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(line).toBeFocused();
  await expect(line).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close settings" })).toBeFocused();

  await line.focus();
  await page.keyboard.press("Enter");
  await expect(line).toHaveAttribute("aria-expanded", "true");
  await expect(report).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(report).toBeFocused();
  await expect(report).toHaveCSS("outline-style", "solid");
  await expect(dialog.getByRole("button", { name: "Clear all draft rankings", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete all local app data", exact: true })).toBeVisible();
  await expectAccessible(page);
  await expectNamesContainVisibleText(page);
});

test("open settings, a row's confirmation and the reset form fit at every width", async ({ page }) => {
  await page.route(/\/api\/data(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), rankingImports: 3 } });
  });
  const dialog = await openSettings(page);
  await dialog.getByRole("button", { name: /^Local data/ }).click();
  await dialog.getByRole("button", { name: "Clear all draft rankings", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete all local app data", exact: true }).click();
  await expect(dialog.getByLabel("Type DELETE to confirm")).toBeVisible();
  const body = dialog.getByRole("region", { name: "Application settings content" });
  for (const width of WIDTHS) {
    await expectFits(page, width);
    expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth), `settings fit at ${width}px`).toBe(true);
  }
});

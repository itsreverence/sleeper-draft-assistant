import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectAccessible, expectNamesContainVisibleText } from "./accessibility";

const codexReady = { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" };
const rankingsCsv = "RK,PLAYER NAME,TEAM,POS\n1,Test Quarterback,BUF,QB1";
const quarterbackCsv = `"Player","Team","ATT","CMP","YDS","TDS","INTS","ATT","YDS","TDS","FL","FPTS"\n"Test Quarterback","BUF","500","330","4,000","30","10","100","500","10","2","365"`;
const runningBackCsv = `"Player","Team","ATT","YDS","TDS","REC","YDS","TDS","FL","FPTS"\n"Test Quarterback","BUF","250","1,000","10","50","500","5","1","163"`;
const adpCsv = "Rank,Player (Bye),POS,Sleeper,RTSports,AVG,Real-Time\n1,Test Quarterback   BUF (7),QB1,18,-,18.0,16";
const csvFile = (name: string, contents: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from(contents) });

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
  await page.route(/\/api\/drafts\/[^/]+\/events(?:\?|$)/, route => route.fulfill({
    contentType: "text/event-stream", body: ": frozen browser fixture\n\n",
  }));
});

async function loadDraft(page: Page, draftId: string, roster = "2") {
  await page.goto("/");
  await page.getByText("Paste a draft ID", { exact: true }).click();
  await page.getByPlaceholder("Paste a draft ID").fill(draftId);
  await page.getByPlaceholder("Optional").fill(roster);
  await page.getByRole("button", { name: "Load draft", exact: true }).click();
}

const heading = (page: Page) => page.getByRole("heading", { level: 2 }).first();
const livePrimaries = (page: Page) => page.locator("main .btn-primary:not(:disabled, .is-disabled)");

async function expectOnePrimary(page: Page, label: string) {
  await expect(livePrimaries(page)).toHaveText([new RegExp(`^\\s*${label}\\s*$`)]);
}

async function expectRingOnKeyboardFocus(page: Page, control: Locator, ringed: Locator) {
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
  await expect(ringed).toHaveCSS("outline-style", "solid");
}

async function openPickerWith(page: Page, key: "Enter" | "Space", files: ReturnType<typeof csvFile>[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press(key);
  await (await chooser).setFiles(files);
}

test("the keyboard walks the checklist from the first upload into the draft room", async ({ page }, testInfo) => {
  let provider: Record<string, unknown> = { id: "noop", label: "None", configured: false, availability: "disabled", detail: "No external AI provider is configured." };
  await page.route("**/api/ai/status", route => route.fulfill({ json: provider }));
  await page.route("**/api/settings", async route => {
    if (route.request().method() === "GET") return route.continue();
    provider = codexReady;
    return route.fulfill({ json: route.request().postDataJSON() });
  });
  await loadDraft(page, `browser-board-prep-${testInfo.project.name}`);

  await expect(heading(page)).toHaveText("Four steps before the draft room");
  await expectOnePrimary(page, "Upload PPR ECR CSV");
  await expectAccessible(page);
  await expectNamesContainVisibleText(page);

  const rankings = page.getByLabel("Upload PPR ECR CSV");
  await expectRingOnKeyboardFocus(page, rankings, page.locator("label.btn-primary"));
  await openPickerWith(page, "Enter", [csvFile("ecr.csv", rankingsCsv)]);

  const projections = page.getByLabel("Upload 2026 projection files");
  await expect(projections).toBeFocused();
  await expect(heading(page)).toHaveText("Three steps before the draft room");
  await expect(page.getByRole("button", { name: /PPR ECR/ })).toContainText("matched");
  await openPickerWith(page, "Space", [csvFile("FantasyPros_Projections_QB.csv", quarterbackCsv), csvFile("FantasyPros_Projections_RB.csv", runningBackCsv)]);

  const adp = page.getByLabel("Upload Sleeper ADP CSV");
  await expect(adp).toBeFocused();
  await expect(heading(page)).toHaveText("Two steps before the draft room");
  await openPickerWith(page, "Enter", [csvFile("adp.csv", adpCsv)]);

  const confirm = page.getByRole("button", { name: "Confirm Assistant settings" });
  await expect(confirm).toBeFocused();
  await expect(heading(page)).toHaveText("One step before the draft room");
  await expectOnePrimary(page, "Confirm Assistant settings");
  await page.keyboard.press("Enter");

  const enter = page.getByRole("button", { name: "Enter draft room" });
  await expect(enter).toBeFocused();
  await expect(heading(page)).toHaveText("Ready for the draft room");
  await expectOnePrimary(page, "Enter draft room");
  await expectAccessible(page);

  const ecrRow = page.locator('[data-step="rankings"] button.row-head');
  await expectRingOnKeyboardFocus(page, ecrRow, ecrRow);
  await page.keyboard.press("Enter");
  await expect(ecrRow).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Replace CSV for PPR ECR")).toBeAttached();
  await page.getByRole("button", { name: "Clear PPR ECR" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Upload PPR ECR CSV")).toBeFocused();
  await expect(heading(page)).toHaveText("One step before the draft room");
  await openPickerWith(page, "Enter", [csvFile("ecr.csv", rankingsCsv)]);

  await expect(enter).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Draft state" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
});

test("a rejected file stays in its row with the upload still focused", async ({ page }) => {
  await page.route(/\/rankings\/import/, route => route.fulfill({ status: 400, json: { error: "Synthetic rejected export." } }));
  await loadDraft(page, "browser-board-pre");
  const rankings = page.getByLabel("Upload PPR ECR CSV");
  await rankings.focus();
  await rankings.setInputFiles(csvFile("ecr.csv", rankingsCsv));
  await expect(page.locator('[data-step="rankings"]').getByRole("alert")).toHaveText("Synthetic rejected export.");
  await expect(rankings).toBeFocused();
  await expect(heading(page)).toHaveText("Four steps before the draft room");
});

test("the emergency board takes focus and hands it back to the next step", async ({ page }) => {
  await loadDraft(page, "browser-board-linear");
  await expect(page.getByRole("button", { name: "Enter draft room" })).toHaveCount(0);
  const emergency = page.getByRole("button", { name: "Open emergency board only" });
  await emergency.focus();
  page.once("dialog", dialog => dialog.accept());
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Emergency board-only mode" })).toBeFocused();
  await page.getByRole("button", { name: "Finish draft setup" }).click();
  await expect(page.getByLabel("Upload PPR ECR CSV")).toBeFocused();
});

test("a completed draft reviews its data without a gate", async ({ page }) => {
  await loadDraft(page, `browser-prep-${randomUUID()}`, "1");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: /Manage draft data/ }).click();

  await expect(heading(page)).toHaveText("Draft is over");
  await expectOnePrimary(page, "View draft results");
  await expectAccessible(page);
  await page.locator('[data-step="rankings"] button.row-head').click();
  await page.getByLabel("Upload CSV for PPR ECR").setInputFiles(csvFile("ecr.csv", rankingsCsv));
  await page.getByRole("button", { name: "Clear PPR ECR" }).click();
  await expect(page.getByLabel("Upload CSV for PPR ECR")).toBeFocused();
  await expect(heading(page)).toHaveText("Draft is over");
  await page.getByRole("button", { name: "View draft results" }).click();
  await expect(page.getByRole("heading", { name: "Draft is over" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Draft picks by round and team" })).toBeVisible();
});

test("the checklist fits a 320px window", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loadDraft(page, "browser-board-linear");
  await expect(heading(page)).toHaveText("Four steps before the draft room");
  await page.getByRole("button", { name: /Sleeper ADP/ }).click();
  await page.getByRole("button", { name: /Assistant/ }).click();
  await page.getByRole("button", { name: /Change settings first/ }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

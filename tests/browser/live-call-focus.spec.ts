import { test, expect } from "@playwright/test";
import { openLiveRoom } from "./draft-room-fixture";

for (const changesMode of [false, true]) {
  test(`team roster restores focus after live pick (mode changes: ${changesMode})`, async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "waiting" });
    const opener = page.locator(".team-header").first();
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const oldOpener = await opener.elementHandle();
    room.pick();
    if (changesMode) for (let i = 0; i < 6; i++) room.pick();
    await expect(page.locator(".pick-strip")).toContainText(changesMode ? /2 picks/ : /8 picks/);
    expect(await oldOpener!.evaluate(el => el.isConnected)).toBe(!changesMode);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (changesMode) await expect(page.getByRole("textbox", { name: "Ask about your draft" })).toBeFocused();
    else {
      await expect(opener).toBeFocused();
      await expect(opener).toHaveCSS("outline-width", "2px");
    }
  });
}

test("player search returns focus to the composer when its opener is gone", async ({ page }) => {
  await openLiveRoom(page, { mode: "on-clock" });
  const opener = page.getByRole("button", { name: "Find player", exact: true }).first();
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await opener.evaluate(el => el.remove());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Ask about your draft" })).toBeFocused();
});

test("team roster keeps focus in the app when the draft completes underneath it", async ({ page }) => {
  const room = await openLiveRoom(page, { mode: "waiting" });
  await page.locator(".team-header").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  room.state.status = "complete";
  room.pick();
  await expect(page.getByRole("textbox", { name: "Ask about your draft" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
});

test("clicking page content keeps the keyboard's place in the Tab order", async ({ page }) => {
  await openLiveRoom(page, { mode: "on-clock" });
  await page.getByText("Best value at a need").first().click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Why this call/ })).toBeFocused();
});

test("settings keeps focus in the app when its opener is gone", async ({ page }) => {
  await openLiveRoom(page, { mode: "on-clock" });
  const opener = page.getByRole("button", { name: "Open settings" });
  const removable = await opener.elementHandle();
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await removable!.evaluate(el => el.remove());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Ask about your draft" })).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("tabindex");
});

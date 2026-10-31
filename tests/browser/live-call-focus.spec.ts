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

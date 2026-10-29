import { expect, type Page } from "@playwright/test";

export const tableAnswer = `Lineup options:\n\n| Player | Position | Projection | Notes |\n| --- | :---: | ---: | --- |\n| Test Quarterback | QB | 20 | ${"LongScoutingNote".repeat(15)} |\n\nReview your starters.`;

export async function expectResponseTable(page: Page) {
  const region = page.getByRole("region", { name: "Response table" });
  await expect(region.getByRole("table")).toBeVisible();
  await expect(region.getByRole("columnheader")).toHaveText(["Player", "Position", "Projection", "Notes"]);
  await expect(region.getByRole("columnheader").nth(1)).toHaveCSS("text-align", "center");
  await expect(region.getByRole("cell").nth(2)).toHaveCSS("text-align", "right");
  await expect(region.getByRole("cell", { name: "Test Quarterback", exact: true })).toBeVisible();
  await expect.poll(() => region.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await region.evaluate(node => {
    const bubble = node.closest(".message-bubble")!;
    return node.getBoundingClientRect().right <= bubble.getBoundingClientRect().right;
  })).toBe(true);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
}

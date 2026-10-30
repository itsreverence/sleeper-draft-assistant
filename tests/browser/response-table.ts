import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const tableAnswer = `Lineup options:\n\n| Player | Position | Projection | Notes |\n| --- | :---: | ---: | --- |\n| Test Quarterback | QB | 20 | ${"LongScoutingNote".repeat(15)} |\n\nReview your starters.`;

export const narrowAndWideTableAnswer = `| Slot | Pick |\n| --- | --- |\n| QB | 1 |\n\n${tableAnswer}`;

export const longUnbrokenTitle = `Long${"Unbroken".repeat(12)}Title`;
export const longWrappingTitle = "A very long synthetic league name that keeps going well past what fits on one line";

export async function expectHeaderFits(page: Page, title: string) {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const gear = await page.getByTitle("Open settings").boundingBox();
  const titleBox = await heading.boundingBox();
  expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(gear!.x);
}

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
  await expect(region).toHaveAttribute("tabindex", "0");
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
}

export async function expectDistinctTableRegions(page: Page, count: number) {
  const regions = page.getByRole("region", { name: "Response table" });
  await expect(regions).toHaveCount(count);
  const names = await regions.evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  expect(new Set(names).size).toBe(count);
  await expect.poll(() => regions.evaluateAll(nodes => nodes.every(node => (node.scrollWidth > node.clientWidth) === node.hasAttribute("tabindex")))).toBe(true);
  const overflowing = await regions.evaluateAll(nodes => nodes.map(node => node.scrollWidth > node.clientWidth));
  expect(overflowing).toContain(true);
  expect(overflowing).toContain(false);
  const { violations } = await new AxeBuilder({ page }).withRules(["landmark-unique"]).analyze();
  expect(violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) }))).toEqual([]);
}

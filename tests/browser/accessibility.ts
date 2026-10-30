import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
}

// Experimental in axe, so the tag-based run above skips it.
export async function expectNamesContainVisibleText(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]).analyze();
  expect(violations.flatMap(({ nodes }) => nodes.map(node => node.target))).toEqual([]);
}

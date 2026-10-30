import { expectDistinctTableRegions, expectHeaderFits, expectResponseTable, longUnbrokenTitle, longWrappingTitle, narrowAndWideTableAnswer, tableAnswer } from "./response-table";
import { expect, test } from "@playwright/test";
import type { AiDraftStrategyPayload, DraftPayload } from "../../apps/web/src/lib/types";
import { expectAccessible } from "./accessibility";

test.beforeEach(async ({ page }) => {
  // No third-party requests from the browser, even if a future UI adds one.
  await page.route("**/*", (route) => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
  // Search is exposed only after an AI strategy exists. Control that external
  // boundary, not the dialog behavior under test; the API itself remains noop.
  const provider = { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } as const;
  await page.route("**/api/ai/status", route => route.fulfill({ json: provider }));
  await page.route(/\/api\/drafts\/[^/]+\/state(?:\?|$)/, async route => {
    const response = await route.fetch();
    const payload = await response.json() as DraftPayload;
    // Put the synthetic user on the clock so search is available immediately.
    payload.state.userTeamId = payload.state.teams.find(team => team.draftSlot === payload.state.currentPick)!.id;
    await route.fulfill({ json: payload });
  });
  // Freeze the demo's automatic pick advancement for layout assertions.
  await page.route(/\/api\/drafts\/[^/]+\/events(?:\?|$)/, route => route.fulfill({
    contentType: "text/event-stream", body: ": frozen browser fixture\n\n",
  }));
  await page.route(/\/api\/drafts\/[^/]+\/strategy(?:\?|$)/, async route => {
    const response = await page.request.get("/api/drafts/mock/state", {
      headers: { Authorization: route.request().headers().authorization },
    });
    const { state } = await response.json() as DraftPayload;
    const player = state.players.find(entry => !state.picks.some(pick => pick.playerId === entry.id))!;
    const strategy: AiDraftStrategyPayload = {
      provider, pickNumber: state.currentPick,
      decision: {
        basedOnPick: state.currentPick, recommendedPlayerId: player.id, alternativePlayerIds: [],
        verdict: "strong", confidence: "high", headline: `Target ${player.name}`, summary: "Synthetic browser scenario.", reasons: [], risks: [],
        plan: { updatedAtPick: state.currentPick, approach: "Synthetic plan", currentPickFocus: [player.position], nextTurnPriorities: ["WR"], positionsThatCanWait: ["QB"], rosterGoals: [], watchItems: [], changeSummary: "Test fixture" },
      },
      recommendedCandidate: { player, rosterFit: "need", evidence: [], orderSource: "ecr", orderLabel: "ECR", requiredToCompleteLineup: true },
      alternativeCandidates: [],
    };
    await route.fulfill({ json: strategy });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try a demo draft" }).click();
  await expect(page.getByRole("button", { name: "Find player", exact: true })).toBeVisible();
});

test("Settings closes with Escape and returns keyboard focus to its opener", async ({ page }) => {
  const opener = page.getByRole("button", { name: "Open settings", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Application settings" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  const close = dialog.getByRole("button", { name: "Close settings" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).not.toBeFocused();
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("native preference popover consumes Escape before its parent dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Find player", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Find player" });
  await dialog.getByRole("searchbox").fill("Achane");
  const trigger = dialog.getByRole("button", { name: "Preference for De'Von Achane" });
  await trigger.click();
  const option = page.getByRole("menuitemradio", { name: /Prioritize/ });
  await expect(option).toBeVisible();
  await option.focus();
  await page.keyboard.press("Escape");
  await expect(option).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("search scrolls to the last result without losing its header or scrolling the page", async ({ page }) => {
  const opener = page.getByRole("button", { name: "Find player", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Find player" });
  const search = dialog.getByRole("searchbox", { name: "Search players" });
  await expect(search).toBeFocused();
  await search.fill("a");
  const rows = dialog.getByRole("listitem");
  await expect.poll(() => rows.count()).toBeGreaterThan(8);
  const last = rows.last();
  await expect(last).not.toBeInViewport();
  const initialScroll = await page.evaluate(() => window.scrollY);
  await rows.first().hover();
  await page.mouse.wheel(0, 10000);
  await expect(last).toBeInViewport();
  await expect(search).toBeInViewport();
  await expect(dialog.getByRole("heading", { name: "Find player" })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(initialScroll);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

// Browser focus/geometry proof for each distinct modal entry point; the modal
// unit suite owns synthetic event edge cases, not actual keyboard navigation.
test("draft plan, roster, and switcher contain keyboard focus and restore their openers", async ({ page }) => {
  const cases = [
    { opener: page.getByRole("button", { name: "Draft plan", exact: true }), name: "Draft plan" },
    { opener: page.getByTitle(/^View .* roster$/).first(), name: / roster$/ },
    { opener: page.getByTitle("Switch league or draft", { exact: true }), name: "Switch league or draft" },
  ];
  for (const { opener, name } of cases) {
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    const first = await page.evaluateHandle(() => document.activeElement);
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(node => document.activeElement === node, first)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  }
});

// The API suite owns persistence. This checks whether real renderer interactions
// unexpectedly invoke its plan-writing route, which an API-only trace misses.
test("draft questions preserve the plan while preference changes request fresh strategy", async ({ page }) => {
  let refreshes = 0;
  page.on("request", request => {
    if (/\/drafts\/[^/]+\/strategy(?:\?|$)/.test(request.url())) refreshes++;
  });
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), answer: "Synthetic answer without a strategy change.", strategyProposal: null } });
  });
  await page.getByRole("button", { name: "Ask about this draft", exact: true }).click();
  await page.getByPlaceholder("Ask who to draft, compare players, or test a what-if.").fill("Compare my options without changing the plan.");
  await page.getByRole("button", { name: "Ask Assistant", exact: true }).click();
  await expect(page.getByText("Synthetic answer without a strategy change.")).toBeVisible();
  await page.getByRole("button", { name: "Draft plan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Draft plan" }).getByText("Synthetic plan", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(refreshes).toBe(0);
  await page.getByRole("button", { name: "Find player", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Find player" });
  await dialog.getByRole("searchbox").fill("Achane");
  await dialog.getByRole("button", { name: "Preference for De'Von Achane" }).click();
  const refreshed = page.waitForResponse(response => /\/drafts\/[^/]+\/strategy(?:\?|$)/.test(response.url()));
  await page.getByRole("menuitemradio", { name: /Prioritize/ }).click();
  expect((await refreshed).ok()).toBe(true);
  await expect.poll(() => refreshes).toBe(1);
});

test("draft and its dialogs meet automated accessibility checks", async ({ page }) => {
  await page.getByRole("button", { name: "Ask about this draft", exact: true }).click();
  await expectAccessible(page);
  for (const name of ["Open settings", "Find player", "Draft plan"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("draft answers contain wide Markdown tables inside the chat bubble", async ({ page }) => {
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), answer: tableAnswer, strategyProposal: null } });
  });
  await page.getByRole("button", { name: "Ask about this draft", exact: true }).click();
  await page.getByPlaceholder("Ask who to draft, compare players, or test a what-if.").fill("Show a table of lineup options.");
  await page.getByRole("button", { name: "Ask Assistant", exact: true }).click();
  await expectResponseTable(page);
});

test("a keyboard-activated suggestion chip hands focus to the draft composer", async ({ page }) => {
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), answer: "Synthetic answer.", strategyProposal: null } });
  });
  await page.getByRole("button", { name: "Ask about this draft", exact: true }).click();
  await page.getByLabel("Suggested questions").getByRole("button").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Suggested questions")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Ask about your draft");
});

for (const [label, title] of [["unbroken", longUnbrokenTitle], ["wrapping", longWrappingTitle]]) {
  test(`a long ${label} draft title stays beside the settings button without page overflow`, async ({ page }) => {
    await page.route(/\/api\/drafts\/[^/]+\/state(?:\?|$)/, async route => {
      const payload = await (await route.fetch()).json() as DraftPayload;
      payload.state.name = title;
      await route.fulfill({ json: payload });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Try a demo draft" }).click();
    for (const width of [1280, 480, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await expectHeaderFits(page, title);
    }
  });
}

test("several answer tables keep unique landmark names and only wide tables take focus", async ({ page }) => {
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), answer: narrowAndWideTableAnswer, strategyProposal: null } });
  });
  await page.getByRole("button", { name: "Ask about this draft", exact: true }).click();
  for (const [index, question] of ["Show lineup options.", "Show them again."].entries()) {
    await page.getByRole("textbox", { name: "Ask about your draft" }).fill(question);
    await page.getByRole("button", { name: "Ask Assistant", exact: true }).click();
    await expect(page.getByText("Review your starters.", { exact: true })).toHaveCount(index + 1);
  }
  await expectDistinctTableRegions(page, 4);
  await expect(page.getByRole("region", { name: "Response table 1 in answer 2", exact: true })).toBeVisible();
  await expectAccessible(page);
});

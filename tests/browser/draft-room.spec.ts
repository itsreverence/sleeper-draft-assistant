import { expect, test, type Page } from "@playwright/test";
import type { AiDraftStrategyPayload, DraftPayload } from "../../apps/web/src/lib/types";
import { expectAccessible } from "./accessibility";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
  const provider = { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } as const;
  await page.route("**/api/ai/status", route => route.fulfill({ json: provider }));
  await page.route(/\/api\/drafts\/[^/]+\/state(?:\?|$)/, async route => {
    const payload = await (await route.fetch()).json() as DraftPayload;
    payload.state.userTeamId = payload.state.teams.find(team => team.draftSlot === payload.state.currentPick)!.id;
    await route.fulfill({ json: payload });
  });
  await page.route(/\/api\/drafts\/[^/]+\/events(?:\?|$)/, route => route.fulfill({
    contentType: "text/event-stream", body: ": frozen browser fixture\n\n",
  }));
  await page.route(/\/api\/drafts\/[^/]+\/strategy(?:\?|$)/, async route => {
    const response = await page.request.get("/api/drafts/mock/state", {
      headers: { Authorization: route.request().headers().authorization },
    });
    const { state } = await response.json() as DraftPayload;
    const taken = new Set(state.picks.map(pick => pick.playerId));
    const [player, ...others] = state.players.filter(entry => !taken.has(entry.id));
    const option = (entry: typeof player) => ({ player: entry!, rosterFit: "need" as const, evidence: [], orderSource: "ecr" as const, orderLabel: "ECR", requiredToCompleteLineup: true });
    const alternatives = others.slice(0, 4);
    const strategy: AiDraftStrategyPayload = {
      provider, pickNumber: state.currentPick,
      decision: {
        basedOnPick: state.currentPick, recommendedPlayerId: player!.id, alternativePlayerIds: alternatives.map(entry => entry.id),
        verdict: "strong", confidence: "high", headline: `Take ${player!.name}`, summary: "Synthetic browser scenario with a summary that runs long enough to wrap across a narrow column.", reasons: [], risks: [],
        plan: { updatedAtPick: state.currentPick, approach: "Synthetic plan", currentPickFocus: [player!.position], nextTurnPriorities: ["WR"], positionsThatCanWait: ["QB"], rosterGoals: [], watchItems: [], changeSummary: "Test fixture" },
      },
      recommendedCandidate: option(player),
      alternativeCandidates: alternatives.map(option),
    };
    await route.fulfill({ json: strategy });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try a demo draft" }).click();
  await expect(page.getByRole("button", { name: "Find player", exact: true })).toBeVisible();
});

const headline = (page: Page) => page.getByRole("heading", { level: 2, name: /^Take / });
const boardHeading = (page: Page) => page.getByRole("heading", { name: /^Board · / });

test("the headline, card, summary, and ladder start above the fold at 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(headline(page)).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: /^Ask Assistant about drafting/ })).toBeInViewport({ ratio: 1 });
  await expect(page.getByText(/^Synthetic browser scenario/)).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("complementary", { name: "Fallback order" }).getByRole("heading")).toBeInViewport();
  expect((await headline(page).boundingBox())!.y).toBeLessThan(300);
  await expect(headline(page)).toHaveCSS("font-size", "28px");
});

test("the call sits left of recent picks at wide widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const call = (await page.getByRole("article", { name: "Assistant call" }).boundingBox())!;
  const side = (await page.getByRole("complementary", { name: "Recent picks and your roster" }).boundingBox())!;
  expect(Math.abs(call.y - side.y)).toBeLessThan(2);
  expect(call.x + call.width).toBeLessThanOrEqual(side.x);
  expect(call.width / (call.width + side.width)).toBeCloseTo(7 / 12, 1);
});

for (const width of [1100, 800, 480, 320]) {
  test(`the room stacks strip, call, recent picks, board, and ask at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const tops = await Promise.all([
      page.getByRole("region", { name: "Draft state" }),
      page.getByRole("article", { name: "Assistant call" }),
      page.getByRole("heading", { name: "Recent picks" }),
      page.getByRole("region", { name: "Draft board" }),
      page.getByRole("button", { name: "Ask about this draft", exact: true }),
    ].map(async locator => (await locator.boundingBox())!.y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    const call = (await page.getByRole("article", { name: "Assistant call" }).boundingBox())!;
    const side = (await page.getByRole("complementary", { name: "Recent picks and your roster" }).boundingBox())!;
    expect(side.y).toBeGreaterThanOrEqual(call.y + call.height);
  });
}

for (const width of [1440, 1100, 800, 480, 320]) {
  test(`no horizontal page overflow at ${width}px with and without the conversation open`, async ({ page }) => {
    await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: "Synthetic answer.", strategyProposal: null } }));
    await page.setViewportSize({ width, height: 900 });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    await expect.poll(fits).toBe(true);
    await page.getByRole("textbox", { name: "Ask about your draft" }).fill("Synthetic question.");
    await page.getByRole("button", { name: "Ask Assistant", exact: true }).click();
    await expect(page.getByText("Synthetic answer.")).toBeVisible();
    await expect.poll(fits).toBe(true);
    await page.getByRole("button", { name: "Show full draft board" }).click();
    await expect.poll(fits).toBe(true);
  });
}

test("the live board shows two rounds and the toggle restores the full board", async ({ page }) => {
  const rounds = page.getByTitle(/^Round \d+: /);
  await expect(rounds).toHaveCount(2);
  await expect(boardHeading(page)).toHaveText("Board · live view");
  const toggle = page.getByRole("button", { name: "Show full draft board" });
  await toggle.click();
  await expect(boardHeading(page)).toHaveText("Board · full view");
  expect(await rounds.count()).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Return to live draft view" }).click();
  await expect(rounds).toHaveCount(2);
});

test("the board keeps its sticky round column and centers the current pick", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  // Centering follows the pick and the view, not a window resize, so re-run it at this width.
  await page.getByRole("button", { name: "Show full draft board" }).click();
  await page.getByRole("button", { name: "Return to live draft view" }).click();
  const scroller = page.locator(".board-scroller");
  const current = page.locator('[data-current="true"]');
  await expect.poll(async () => {
    const [cell, box] = await Promise.all([current.boundingBox(), scroller.boundingBox()]);
    return cell!.x + cell!.width > box!.x && cell!.x < box!.x + box!.width;
  }).toBe(true);
  await scroller.evaluate(node => node.scrollTo({ left: 200, behavior: "instant" }));
  const roundCell = page.getByTitle(/^Round \d+: /).first();
  await expect.poll(async () => Math.round((await roundCell.boundingBox())!.x)).toBe(Math.round((await scroller.boundingBox())!.x));
});

test("the collapsed command bar asks in one line and expands in place", async ({ page }) => {
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: "Synthetic answer.", strategyProposal: null } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  const toggle = page.getByRole("button", { name: "Ask about this draft", exact: true });
  const composer = page.getByRole("textbox", { name: "Ask about your draft" });
  const chips = page.getByLabel("Suggested questions").getByRole("button");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(chips).toHaveCount(3);
  const barHeight = (await page.locator(".ask-panel").boundingBox())!.height;
  expect(barHeight).toBeLessThan(80);
  expect(Math.abs((await composer.boundingBox())!.y - (await chips.first().boundingBox())!.y)).toBeLessThan(16);
  await chips.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Synthetic answer.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(composer).toBeFocused();
  await toggle.click();
  await expect(page.getByRole("log", { name: "Draft conversation" })).toHaveCount(0);
  await toggle.click();
  await expect(page.getByText("Synthetic answer.")).toBeVisible();
});

test("the strip carries the draft tools and the primary button asks about the call", async ({ page }) => {
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: "Synthetic answer.", strategyProposal: null } }));
  const strip = page.getByRole("region", { name: "Draft state" });
  await expect(strip).toContainText("You are on the clock");
  await expect(strip).toContainText(/Pick \d+\.\d+ \(#\d+\)/);
  await expect(strip).toContainText(/Round \d+/);
  await expect(strip.getByRole("button", { name: "Find player", exact: true })).toBeVisible();
  await expect(strip.getByRole("button", { name: "Draft plan", exact: true })).toBeVisible();
  await expect(page.locator(".recommendation-panel .btn-primary")).toHaveCount(1);
  await page.getByRole("button", { name: /^Ask Assistant about drafting/ }).click();
  await expect(page.getByText("Synthetic answer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask about this draft", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("the draft room meets automated accessibility checks with the conversation collapsed", async ({ page }) => {
  await expectAccessible(page);
});

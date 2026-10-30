import { expectConversationBehavior } from "./conversation-behavior";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { AiDraftStrategyPayload, DraftPayload } from "../../apps/web/src/lib/types";
import { expectAccessible } from "./accessibility";

const longAnswer = Array.from({ length: 30 }, (_, index) => `Line ${index + 1} of a long synthetic answer.`).join("\n\n");

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
  const provider = { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } as const;
  await page.route("**/api/ai/status", route => route.fulfill({ json: provider }));
  await page.route(/\/api\/drafts\/[^/]+\/state(?:\?|$)/, async route => {
    const response = await route.fetch();
    const payload = await response.json() as DraftPayload;
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
  await page.getByRole("button", { name: "Ask about this draft", exact: true }).click();
});

async function ask(page: Page, question: string) {
  await page.getByRole("textbox", { name: "Ask about your draft" }).fill(question);
  await page.getByRole("button", { name: "Ask Assistant", exact: true }).click();
}

// Where the newest message's top edge sits relative to the thread's visible box.
function newestOffset(thread: Locator) {
  return thread.evaluate(node => node.lastElementChild!.getBoundingClientRect().top - node.getBoundingClientRect().top);
}

test("the thread scrolls to the start of each new answer and keeps the composer reachable", async ({ page }) => {
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: longAnswer, strategyProposal: null } }));
  const thread = page.getByRole("log", { name: "Draft conversation" });
  for (const [index, question] of ["First question.", "Second question."].entries()) {
    await ask(page, question);
    await expect(page.getByText("Line 30 of a long synthetic answer.")).toHaveCount(index + 1);
    await expect.poll(() => thread.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect.poll(() => newestOffset(thread)).toBeLessThan(2);
    await expect.poll(() => newestOffset(thread)).toBeGreaterThan(-2);
  }
  for (const viewport of [page.viewportSize()!, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport);
    expect(await thread.evaluate(node => node.getBoundingClientRect().height < window.innerHeight)).toBe(true);
    const composer = page.getByRole("textbox", { name: "Ask about your draft" });
    await composer.scrollIntoViewIfNeeded();
    await expect(composer).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("an answer that arrives while the reader has scrolled up does not move the thread", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let asked = 0;
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, async route => {
    if (++asked > 1) await held;
    await route.fulfill({ json: { answer: longAnswer, strategyProposal: null } });
  });
  const thread = page.getByRole("log", { name: "Draft conversation" });
  await ask(page, "First question.");
  await expect(page.getByText("Line 30 of a long synthetic answer.")).toHaveCount(1);
  await ask(page, "Second question.");
  await expect(page.getByText("Thinking…")).toBeVisible();
  await thread.evaluate(node => node.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => thread.evaluate(node => node.scrollTop)).toBe(0);
  // The scroll event that records "reading history" fires on the next frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  release();
  await expect(page.getByText("Line 30 of a long synthetic answer.")).toHaveCount(2);
  await page.waitForTimeout(400);
  expect(await thread.evaluate(node => node.scrollTop)).toBe(0);
  expect(await newestOffset(thread)).toBeGreaterThan(await thread.evaluate(node => node.clientHeight));
});

test("cancel returns the composer to idle and the late answer never appears", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, async route => {
    await held;
    await route.fulfill({ json: { answer: longAnswer, strategyProposal: null } }).catch(() => undefined);
  });
  await ask(page, "Question to cancel.");
  await expect(page.getByText("Thinking…")).toBeVisible();
  const cancelled = page.waitForRequest(request => request.method() === "DELETE" && /\/api\/ai\/requests\//.test(request.url()));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await cancelled;
  await expect(page.getByText("Thinking…")).toHaveCount(0);
  await expect(page.getByText(/^Cancelled\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask Assistant", exact: true })).toBeVisible();
  await expectAccessible(page);
  release();
  await page.waitForTimeout(500);
  await expect(page.getByText("Line 30 of a long synthetic answer.")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Ask about your draft" }).fill("A fresh question.");
  await expect(page.getByRole("button", { name: "Ask Assistant", exact: true })).toBeEnabled();
});

test("draft composer preserves native focus and sends only completed turns", async ({ page }) => {
  await expectConversationBehavior(page, {
    route: /\/api\/drafts\/[^/]+\/ask(?:\?|$)/,
    inputName: "Ask about your draft", sendName: "Ask Assistant", logName: "Draft conversation", inputKey: "Enter",
  });
});

import { expect, test } from "@playwright/test";
import type { AiDraftStrategyPayload, DraftPayload } from "../../apps/web/src/lib/types";

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

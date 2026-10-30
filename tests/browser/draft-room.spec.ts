import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./accessibility";
import { buildStrategy, openLiveRoom, type LiveRoom } from "./draft-room-fixture";

const strip = (page: Page) => page.getByRole("region", { name: "Draft state" });
const shortlist = (page: Page) => page.getByRole("table", { name: /^(Assistant's shortlist|Targets if available)/ });
const board = (page: Page) => page.getByRole("table", { name: "Draft picks by round and team" });
const topName = (page: Page) => shortlist(page).locator(".top-row .name");
const composer = (page: Page) => page.getByRole("textbox", { name: "Ask about your draft" });
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const liveText = (page: Page) => page.locator('p[aria-live="polite"]');

async function playOutToWaiting(room: LiveRoom, page: Page) {
  await expect(shortlist(page)).toBeVisible();
  for (let played = 0; played < 3; played += 1) room.pick();
  await expect(board(page)).toBeVisible();
}

test.describe("on the clock", () => {
  test("leads with one ranked list and nothing competing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLiveRoom(page, { mode: "on-clock" });
    await expect(strip(page).getByRole("heading")).toHaveText("On the clock");
    await expect(strip(page)).toContainText(/Pick 1\.09 · next 2\.02/);
    await expect(strip(page).getByRole("button", { name: "Find player", exact: true })).toBeVisible();
    await expect(strip(page).getByRole("button", { name: "Plan", exact: true })).toBeVisible();
    await expect(page.getByText("On the clock", { exact: true })).toHaveCount(1);

    await expect(shortlist(page).getByRole("rowheader")).toHaveCount(4);
    await expect(topName(page)).toBeInViewport({ ratio: 1 });
    await expect(topName(page)).toHaveCSS("font-size", "22px");
    await expect(page.getByText("Best value at a need. Unlikely to reach your next pick.")).toBeVisible();
    await expect(page.getByText("Synthetic summary")).toHaveCount(0);

    await expect(page.locator(".btn-primary")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Draft board" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recent picks" })).toHaveCount(0);
    await expect(page.getByText(/^Last 3: /)).toBeVisible();
    await expect(page.getByRole("list", { name: "Starter slots filled" })).toContainText("RB 0/2");
    await expect(composer(page)).toHaveAttribute("placeholder", "Ask about this pick…");

    const frame = (await page.locator(".shortlist-frame").boundingBox())!;
    expect(frame.width).toBeLessThanOrEqual(880);
    await expectAccessible(page);
  });

  test("keeps every moved capability reachable", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "on-clock" });
    await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: "Synthetic answer.", strategyProposal: null } }));
    await expect(shortlist(page)).toBeVisible();

    const why = page.getByRole("button", { name: "Why this call" });
    await why.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Synthetic reason.")).toBeVisible();
    await expect(page.getByText("Synthetic risk.")).toBeVisible();
    await expect(page.getByText(/^Synthetic summary/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: `Ask about ${room.available()[0]!.name}` }).click();
    await expect(page.getByText("Synthetic answer.")).toBeVisible();

    await page.getByRole("button", { name: `Preference for ${room.available()[0]!.name}` }).click();
    await expect(page.getByRole("menuitemradio", { name: /Prioritize/ })).toBeVisible();
    await page.keyboard.press("Escape");

    const boardToggle = page.getByRole("button", { name: "Board", exact: true });
    await boardToggle.click();
    await expect(boardToggle).toHaveAttribute("aria-expanded", "true");
    await expect(board(page)).toBeVisible();
    await page.getByRole("button", { name: "Show full draft board" }).click();
    await boardToggle.click();
    await expect(board(page)).toHaveCount(0);

    const activity = page.getByRole("button", { name: "Picks and roster" });
    await activity.click();
    const drawer = page.getByRole("dialog", { name: "Picks and roster" });
    await expect(drawer.getByRole("heading", { name: "Recent picks" })).toBeVisible();
    await expect(drawer.getByRole("list", { name: "Starter slots filled" })).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(activity).toBeFocused();

    const plan = strip(page).getByRole("button", { name: "Plan", exact: true });
    await plan.click();
    const planDrawer = page.getByRole("dialog", { name: "Draft plan" });
    await expect(planDrawer.getByText("Next turn:")).toContainText("WR");
    await expect(planDrawer.getByText("Can wait:")).toContainText("QB");
    await page.keyboard.press("Escape");
    await expect(plan).toBeFocused();
  });

  test("offers question chips to the keyboard and not to a mouse click on Board", async ({ page }) => {
    await openLiveRoom(page, { mode: "on-clock" });
    const chips = page.getByLabel("Suggested questions").getByRole("button");
    await expect(chips.first()).toBeHidden();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(chips.first()).toBeHidden();
    await composer(page).focus();
    await expect(chips.first()).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(chips.first()).toBeFocused();
  });
});

for (const shortlistSize of [2, 3]) {
  test(`an own pick removes roster-infeasible choices (shortlist size ${shortlistSize})`, async ({ page }) => {
    const room = await openLiveRoom(page, {
      mode: "on-clock", shortlistSize,
      configure: state => {
        const [rb1, rb2] = state.players.filter(player => player.position === "RB");
        const te = state.players.find(player => player.position === "TE")!;
        const teams = state.teams.slice(0, 2).map(team => ({ ...team, roster: [] }));
        return { ...state, currentPick: 2, userTeamId: teams[1]!.id,
          settings: { ...state.settings, teams: 2, rounds: 2, rosterSlots: { RB: 1, TE: 1 } },
          teams, players: [rb1!, rb2!, te], picks: [], pickOrder: undefined };
      },
    });
    const [rb1, rb2, te] = room.available();
    await expect(topName(page)).toHaveText(rb1!.name);
    room.setHold(true);
    room.pick(rb1!.id);
    await expect(strip(page).getByRole("heading")).toHaveText("On the clock");
    await expect(shortlist(page)).not.toContainText(rb2!.name);
    await expect(page.locator(".taken")).toHaveCount(0);
    if (shortlistSize === 3) await expect(topName(page)).toHaveText(te!.name);
    else {
      await expect(page.locator(".all-gone")).toContainText("No player on this shortlist is available for your roster.");
      await expect(page.locator(".all-gone").getByRole("button", { name: "Find player", exact: true })).toBeVisible();
    }
  });
}

test.describe("target taken", () => {
  test("strikes the row, promotes the next choice, and holds the list until the new call lands", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const room = await openLiveRoom(page, { mode: "one-away" });
    await expect(strip(page).getByRole("heading")).toHaveText("1 pick away");
    await expect(shortlist(page)).toBeVisible();
    const [target, next] = room.available();
    await expect(topName(page)).toHaveText(target!.name);

    room.setHold(true);
    room.pick(target!.id);

    const taken = page.locator(".taken");
    await expect(taken.locator("s")).toHaveText(target!.name);
    await expect(taken).toContainText("Taken by Team 9");
    await expect(topName(page)).toHaveText(next!.name);
    await expect(page.getByText("The Assistant's next choice. New call on the way.")).toBeVisible();
    await expect(strip(page)).toContainText("Updating call…");
    await expect(strip(page).getByRole("heading")).toHaveText("On the clock");
    await expect(liveText(page)).toHaveText(`Pick 1.10. You are on the clock. ${target!.name} was taken by Team 9. ${next!.name} is the Assistant's next choice.`);
    await expectAccessible(page);

    await expect.poll(() => room.held.length).toBe(1);
    const before = (await topName(page).boundingBox())!;
    const frameBefore = (await page.locator(".shortlist-frame").boundingBox())!;
    await room.held[0]!.respond(buildStrategy(room.state));
    await expect(strip(page)).not.toContainText("Updating call…");
    await expect(page.getByText("Best value at a need. Unlikely to reach your next pick.")).toBeVisible();
    await expect(page.locator(".taken s")).toHaveText(target!.name);
    const after = (await topName(page).boundingBox())!;
    expect(after.y).toBe(before.y);
    expect((await page.locator(".shortlist-frame").boundingBox())!.y).toBe(frameBefore.y);
  });

  test("shows a clear state pointing at Find player when every shortlist player is gone", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "two-away", shortlistSize: 2 });
    await expect(strip(page).getByRole("heading")).toHaveText("2 picks away");
    await expect(shortlist(page)).toBeVisible();
    const [first, second] = room.available();
    room.setHold(true);
    room.pick(first!.id);
    await expect(topName(page)).toHaveText(second!.name);
    room.pick(second!.id);
    const gone = page.locator(".all-gone");
    await expect(gone).toContainText("No player on this shortlist is available for your roster.");
    await expect(gone).toContainText("A new call is on the way.");
    await expect(page.locator(".taken")).toHaveCount(2);
    await expectAccessible(page);
    const find = gone.getByRole("button", { name: "Find player", exact: true });
    await find.click();
    await expect(page.getByRole("dialog", { name: "Find player" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(find).toBeFocused();
  });
});

test.describe("waiting", () => {
  test("the board leads with a watch line, the needs line and the composer", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "two-away" });
    await playOutToWaiting(room, page);
    await expect(strip(page).getByRole("heading")).toHaveText("6 picks away");
    await expect(shortlist(page)).toHaveCount(0);
    const watching = page.getByRole("heading", { name: "Watching" }).locator("..").getByRole("listitem");
    await expect(watching).toHaveCount(4);
    await expect(page.getByRole("list", { name: "Starter slots filled" })).toBeVisible();
    await expect(composer(page)).toHaveAttribute("placeholder", "Ask about this draft…");
    await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveCount(0);
    await expect(page.getByTitle(/^Round \d+: /)).toHaveCount(2);
    await expect(board(page).getByText("Your pick")).toHaveCount(1);
    const wide = (await page.getByRole("region", { name: "Draft board" }).boundingBox())!;
    if (page.viewportSize()!.width > 1000) expect(wide.width).toBeGreaterThan(880);
    await expectAccessible(page);

    await page.getByRole("button", { name: "Show full draft board" }).click();
    expect(await page.getByTitle(/^Round \d+: /).count()).toBeGreaterThan(2);
    await page.getByRole("button", { name: "Return to live draft view" }).click();
    await expect(page.getByTitle(/^Round \d+: /)).toHaveCount(2);

    await page.getByRole("button", { name: "Picks and roster" }).click();
    await expect(page.getByRole("dialog", { name: "Picks and roster" }).getByRole("heading", { name: "Recent picks" })).toBeVisible();
  });

  test("no strategy means no watch line, and no request until near the turn", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "waiting" });
    await expect(board(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Watching" })).toHaveCount(0);
    expect(room.strategyRequests).toBe(0);
  });

  test("focus on a control the next pick removes moves to the composer", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "two-away" });
    await expect(shortlist(page)).toBeVisible();
    const toggle = page.getByRole("button", { name: "Board", exact: true });
    await toggle.focus();
    for (let played = 0; played < 3; played += 1) room.pick();
    await expect(toggle).toHaveCount(0);
    await expect(composer(page)).toBeFocused();
  });
});

test.describe("tools without a strategy", () => {
  test("Find player and an honest Plan work during a slow first call", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "on-clock", holdStrategies: true });
    await expect(page.getByText("Thinking…")).toBeVisible();
    const opener = strip(page).getByRole("button", { name: "Find player", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Find player" });
    await dialog.getByRole("searchbox").fill("Achane");
    await expect(dialog.getByRole("button", { name: "Preference for De'Von Achane" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();

    const plan = strip(page).getByRole("button", { name: "Plan", exact: true });
    await plan.click();
    await expect(page.getByRole("dialog", { name: "Draft plan" })).toContainText("No plan yet.");
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    expect(room.strategyRequests).toBe(1);
  });

  test("a failed first call keeps Find player and offers a retry", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "on-clock", holdStrategies: true });
    await expect.poll(() => room.held.length).toBe(1);
    await room.held[0]!.fail("Synthetic strategy failure.");
    await expect(page.getByText("Assistant call unavailable")).toBeVisible();
    await expect(page.getByText("Synthetic strategy failure.")).toBeVisible();
    await expect(strip(page).getByRole("button", { name: "Find player", exact: true })).toBeEnabled();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Retry call" }).click();
    await expect.poll(() => room.held.length).toBe(2);
    await room.held[1]!.respond(buildStrategy(room.held[1]!.state));
    await expect(shortlist(page)).toBeVisible();
  });

  test("a failed refresh keeps the list readable", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "one-away" });
    await expect(shortlist(page)).toBeVisible();
    room.setHold(true);
    room.pick();
    await expect.poll(() => room.held.length).toBe(1);
    await room.held[0]!.fail("Synthetic refresh failure.");
    await expect(page.getByText("Call update failed.")).toBeVisible();
    await expect(shortlist(page).getByRole("rowheader").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry call" })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("stale answers", () => {
  test("an answer the board overtook still appears, with its taken target never on top", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "two-away", holdStrategies: true });
    await expect.poll(() => room.held.length).toBe(1);
    const oldBoard = room.held[0]!.state;
    const answer = buildStrategy(oldBoard);
    room.pick(answer.recommendedCandidate.player.id);
    await expect.poll(() => room.held.length).toBe(2);

    await room.held[0]!.respond(answer);
    await expect(page.locator(".taken s")).toHaveText(answer.recommendedCandidate.player.name);
    await expect(topName(page)).toHaveText(answer.alternativeCandidates[0]!.player.name);
    await expect(shortlist(page)).toHaveAccessibleName(/from pick 2\.05$/);
    await expect(strip(page)).toContainText("Updating call…");

    await room.held[1]!.respond(buildStrategy(room.held[1]!.state));
    await expect(strip(page)).not.toContainText("Updating call…");
    await expect(shortlist(page)).toHaveAccessibleName("Targets if available");
  });

  test("a stale answer arriving after a newer one is ignored", async ({ page }) => {
    const room = await openLiveRoom(page, { mode: "two-away", holdStrategies: true });
    await expect.poll(() => room.held.length).toBe(1);
    const stale = buildStrategy(room.held[0]!.state);
    room.pick(stale.recommendedCandidate.player.id);
    await expect.poll(() => room.held.length).toBe(2);
    const fresh = buildStrategy(room.held[1]!.state);
    await room.held[1]!.respond(fresh);
    await expect(topName(page)).toHaveText(fresh.recommendedCandidate.player.name);
    await room.held[0]!.respond(stale);
    await expect(page.locator(".taken")).toHaveCount(0);
    await expect(shortlist(page)).toHaveAccessibleName("Targets if available");
    await expect(topName(page)).toHaveText(fresh.recommendedCandidate.player.name);
  });
});

for (const width of [1440, 1100, 800, 480, 320]) {
  test(`every mode fits at ${width}px without page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const room = await openLiveRoom(page, { mode: "two-away", rename: { "Jahmyr Gibbs": "Christopher Montgomery-Williamson III" } });
    await page.route(/\/api\/drafts\/[^/]+\/ask(?:\?|$)/, route => route.fulfill({ json: { answer: "Synthetic answer.", strategyProposal: null } }));
    await expect(shortlist(page)).toBeVisible();
    await expect.poll(() => fits(page)).toBe(true);
    await page.getByRole("button", { name: "Why this call" }).click();
    await expect.poll(() => fits(page)).toBe(true);
    await composer(page).fill("Synthetic question.");
    await page.getByRole("button", { name: "Ask Assistant", exact: true }).click();
    await expect(page.getByText("Synthetic answer.")).toBeVisible();
    await expect.poll(() => fits(page)).toBe(true);
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(board(page)).toBeVisible();
    await expect.poll(() => fits(page)).toBe(true);
    room.pick(room.available()[0]!.id);
    await expect(page.locator(".taken")).toBeVisible();
    await expect.poll(() => fits(page)).toBe(true);
    room.pick();
    room.pick();
    await expect(page.getByRole("heading", { name: "Watching" })).toBeVisible();
    await expect.poll(() => fits(page)).toBe(true);
  });
}

test("320px keeps the top row, tools and composer usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const room = await openLiveRoom(page, { mode: "one-away", rename: { "Jahmyr Gibbs": "Christopher Montgomery-Williamson III" } });
  await expect(topName(page)).toBeInViewport();
  room.setHold(true);
  const before = (await page.locator(".shortlist-frame").boundingBox())!;
  room.pick(room.available()[0]!.id);
  await expect(strip(page)).toContainText("Updating call…");
  expect((await page.locator(".shortlist-frame").boundingBox())!.y).toBe(before.y);
  await expect(strip(page).getByRole("button", { name: "Find player", exact: true })).toBeVisible();
  await expect(composer(page)).toBeVisible();
  await expectAccessible(page);
});

test("the shortlist does not animate rows or the refresh for reduced-motion users", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLiveRoom(page, { mode: "on-clock" });
  await expect(shortlist(page)).toBeVisible();
  const chevron = page.getByRole("button", { name: "Why this call" }).locator(".icon");
  expect(await chevron.evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
});

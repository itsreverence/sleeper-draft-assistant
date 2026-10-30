import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page } from "@playwright/test";
import type { AiDraftStrategyPayload, DraftOption, DraftPayload, DraftState } from "../../apps/web/src/lib/types";

const provider = { id: "codex-app-server", label: "Synthetic provider", configured: true, availability: "available" } as const;

export type RoomMode = "on-clock" | "one-away" | "two-away" | "waiting";

// The demo draft opens on pick 9. Snake order leaves no slot two picks away from there, so that mode starts on pick 15.
const userPickNumber: Record<RoomMode, number> = { "on-clock": 9, "one-away": 10, "two-away": 17, waiting: 18 };
const openingPicks: Record<RoomMode, number> = { "on-clock": 0, "one-away": 0, "two-away": 6, waiting: 0 };

function snakeSlot(pickNo: number, teams: number) {
  const round = Math.ceil(pickNo / teams);
  const inRound = ((pickNo - 1) % teams) + 1;
  return round % 2 === 1 ? inRound : teams + 1 - inRound;
}

export function buildStrategy(state: DraftState, shortlistSize = 4): AiDraftStrategyPayload {
  const taken = new Set(state.picks.map(pick => pick.playerId));
  const [player, ...others] = state.players.filter(entry => !taken.has(entry.id));
  const option = (entry: DraftState["players"][number]): DraftOption => ({ player: entry, rosterFit: "need", evidence: [`ECR rank ${entry.importedRank ?? "unknown"}`], orderSource: "ecr", orderLabel: "ECR", requiredToCompleteLineup: true });
  const alternatives = others.slice(0, shortlistSize - 1);
  return {
    provider, pickNumber: state.currentPick,
    decision: {
      basedOnPick: state.currentPick, recommendedPlayerId: player!.id, alternativePlayerIds: alternatives.map(entry => entry.id),
      verdict: "strong", confidence: "high", headline: `Take ${player!.name}`,
      summary: "Synthetic summary that explains the decisive advantage of this pick and its immediate consequence for the roster in about thirty words.",
      reasonLine: "Best value at a need. Unlikely to reach your next pick.",
      reasons: ["Synthetic reason."], risks: ["Synthetic risk."],
      plan: { updatedAtPick: state.currentPick, approach: "Synthetic plan", currentPickFocus: [player!.position], nextTurnPriorities: ["WR"], positionsThatCanWait: ["QB"], rosterGoals: ["Synthetic goal"], watchItems: [], changeSummary: "Test fixture" },
    },
    recommendedCandidate: option(player!),
    alternativeCandidates: alternatives.map(option),
  };
}

type HeldStrategy = { respond: (json: AiDraftStrategyPayload) => Promise<void>; fail: (message: string) => Promise<void>; state: DraftState };

// A real local event stream so a pick arrives through the browser's EventSource and the renderer's own listener.
export async function openLiveRoom(page: Page, options: { mode: RoomMode; holdStrategies?: boolean; shortlistSize?: number; rename?: Record<string, string>; configure?: (state: DraftState) => DraftState }) {
  const streams = new Set<ServerResponse>();
  let latestFrame = "";
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    response.write(`: live browser fixture\n\n${latestFrame}`);
    streams.add(response);
    response.on("close", () => streams.delete(response));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  page.once("close", () => server.close());

  let payload!: DraftPayload;
  const held: HeldStrategy[] = [];
  let strategyRequests = 0;
  let holdStrategies = options.holdStrategies ?? false;

  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:15173"
    ? route.continue() : route.abort());
  await page.route("**/api/ai/status", route => route.fulfill({ json: provider }));
  await page.route(/\/api\/drafts\/[^/]+\/events(?:\?|$)/, route => route.continue({ url: `http://127.0.0.1:${port}/` }));
  await page.route(/\/api\/drafts\/[^/]+\/state(?:\?|$)/, async route => {
    const fetched = await (await route.fetch()).json() as DraftPayload;
    const { teams } = fetched.state.settings;
    fetched.state.userTeamId = fetched.state.teams.find(team => team.draftSlot === snakeSlot(userPickNumber[options.mode], teams))!.id;
    for (const player of fetched.state.players) player.name = options.rename?.[player.name] ?? player.name;
    for (const team of fetched.state.teams) team.name = `Team ${team.draftSlot}`;
    fetched.state = options.configure?.(fetched.state) ?? fetched.state;
    payload = fetched;
    for (let played = 0; played < openingPicks[options.mode]; played += 1) applyPick();
    fetched.state.status = "drafting";
    await route.fulfill({ json: fetched });
  });
  await page.route(/\/api\/drafts\/[^/]+\/strategy(?:\?|$)/, async route => {
    strategyRequests += 1;
    const state = structuredClone(payload.state);
    if (!holdStrategies) {
      await route.fulfill({ json: buildStrategy(state, options.shortlistSize) });
      return;
    }
    held.push({
      state,
      respond: json => route.fulfill({ json }),
      fail: message => route.fulfill({ status: 500, json: { error: message } }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Try a demo draft" }).click();
  await expect(page.getByRole("button", { name: "Find player", exact: true })).toBeVisible();

  function available() {
    const taken = new Set(payload.state.picks.map(pick => pick.playerId));
    return payload.state.players.filter(player => !taken.has(player.id));
  }

  function publish() {
    latestFrame = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const stream of streams) stream.write(latestFrame);
  }

  function applyPick(playerId: string = available().at(-1)!.id) {
    const { state } = payload;
    const { teams } = state.settings;
    const pickNo = state.currentPick;
    const draftSlot = snakeSlot(pickNo, teams);
    const team = state.teams.find(entry => entry.draftSlot === draftSlot)!;
    state.picks = [...state.picks, { pickNo, round: Math.ceil(pickNo / teams), draftSlot, teamId: team.id, playerId }];
    team.roster = [...team.roster, playerId];
    state.currentPick = pickNo + 1;
    state.updatedAt = new Date().toISOString();
  }

  return {
    get state() { return payload.state; },
    get strategyRequests() { return strategyRequests; },
    held,
    setHold(value: boolean) { holdStrategies = value; },
    available,
    // Plays the next pick for whichever team is on the clock; the board reaches the page only through the stream.
    pick(playerId?: string) {
      applyPick(playerId);
      publish();
    },
  };
}

export type LiveRoom = Awaited<ReturnType<typeof openLiveRoom>>;

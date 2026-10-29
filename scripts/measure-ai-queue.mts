// Controlled overlap probe: npx tsx scripts/measure-ai-queue.mts [baseline-provider-path]
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { CodexAppServerProvider, type CodexAppServerClient } from "../apps/api/src/ai/codex-app-server-provider";
import { buildDraftQuestionContext, buildDraftStrategyContext } from "../apps/api/src/ai/context";
import { createMockDraftState } from "../packages/engine/src/index";

const Baseline: typeof CodexAppServerProvider = process.argv[2]
  ? (await import(pathToFileURL(resolve(process.argv[2])).href)).CodexAppServerProvider
  : CodexAppServerProvider;
const state = createMockDraftState(0);
const question = buildDraftQuestionContext(state, "Synthetic queue probe");
const strategy = buildDraftStrategyContext(state);
const decision = JSON.stringify({ basedOnPick: state.currentPick, recommendedPlayerId: "fixture", alternativePlayerIds: [], verdict: "strong", confidence: "high", headline: "Fixture", summary: "Fixture", reasons: ["Fixture"], risks: [], plan: { updatedAtPick: state.currentPick, approach: "Fixture", currentPickFocus: ["RB"], nextTurnPriorities: ["WR"], positionsThatCanWait: ["QB"], rosterGoals: ["Fixture"], watchItems: [], changeSummary: "Fixture" } });
for (let run = 0; run < 5; run++) {
  for (const [name, Provider] of [["before", Baseline], ["after", CodexAppServerProvider]] as const) {
    let releaseStarted!: () => void;
    const started = new Promise<void>((resolve) => { releaseStarted = resolve; });
    const order: string[] = [];
    let closed = false;
    const client: CodexAppServerClient = {
      initialize: async () => {},
      request: async <T>() => ({ thread: { id: "synthetic" } }) as T,
      runTurn: async (_id, prompt) => {
        const isStrategy = prompt.includes('"task": "draft_strategy"');
        order.push(isStrategy ? "strategy" : "question");
        releaseStarted();
        await delay(isStrategy ? 300 : 100);
        return isStrategy ? decision : "Fixture answer";
      },
      isClosed: () => closed, close: () => { closed = true; },
    };
    const provider = new Provider({ webSearch: false, clientFactory: async () => client });
    const first = provider.answerDraftQuestion(question);
    await started;
    const refresh = provider.strategizeDraft(strategy, [], { automatic: true });
    const begin = performance.now();
    const answer = await provider.answerDraftQuestion(question);
    const wallMs = performance.now() - begin;
    assert.equal(answer.answer, "Fixture answer");
    await Promise.all([first, refresh]);
    assert.equal(order.length, 3);
    assert.deepEqual(order, name === "before" && process.argv[2] ? ["question", "strategy", "question"] : ["question", "question", "strategy"]);
    console.log(JSON.stringify({ name, run, wallMs, order, failures: 0 }));
    provider.close();
  }
}

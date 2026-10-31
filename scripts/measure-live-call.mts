import { CodexAppServerProvider } from "../apps/api/src/ai/codex-app-server-provider";
import { buildDraftStrategyContext } from "../apps/api/src/ai/context";
import { createDraftPlayerSnapshot, createDraftStrategyTools } from "../apps/api/src/ai/draft-tools";
import assert from "node:assert/strict";
import { createMockDraftState, isDraftChoiceRosterFeasible } from "../packages/engine/src/index";
const state = createMockDraftState(17);
const snapshot = createDraftPlayerSnapshot(state, { pinned: [], faded: [], excluded: [] });
const provider = new CodexAppServerProvider({ serviceTier: "fast" });
const start = performance.now();
try {
  const result = await provider.strategizeDraft(buildDraftStrategyContext(state, undefined, snapshot), createDraftStrategyTools(snapshot), { automatic: true });
  const ids = [result.decision.recommendedPlayerId, ...result.decision.alternativePlayerIds];
  assert.equal(result.decision.basedOnPick, state.currentPick);
  assert.ok(ids.length > 1);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => state.players.some(player => player.id === id)
    && !state.picks.some(pick => pick.playerId === id) && isDraftChoiceRosterFeasible(state, id)));
  console.log(JSON.stringify({ completed: true, wallMs: performance.now() - start, alternatives: result.decision.alternativePlayerIds.length, timings: provider.timingDiagnostics(), news: provider.newsDiagnostics() }));
} catch { console.log(JSON.stringify({ completed: false, timings: provider.timingDiagnostics() })); process.exitCode = 1; }
finally { provider.close(); }

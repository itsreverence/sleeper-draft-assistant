import type {
  AdpImportSummary,
  AppSettings,
  AiDraftDecision,
  CandidateSignal,
  DraftRecommendation,
  DraftState,
  RankingImportSummary,
  SeasonProjectionImportSummary,
} from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { app } from "./index";

type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
  seasonProjectionImportSummary: SeasonProjectionImportSummary | null;
  adpImportSummary: AdpImportSummary | null;
};

type AskPayload = {
  answer: string;
  recommendation: DraftRecommendation;
  provider: { id: string; label: string; configured: boolean };
};

type CandidateEvaluationPayload = {
  answer: string;
  playerId: string;
  playerName: string;
  pickNumber: number;
  provider: { id: string };
};

type StrategyPayload = {
  provider: { id: string };
  pickNumber: number;
  decision: AiDraftDecision;
  recommendedCandidate: CandidateSignal;
  alternativeCandidates: CandidateSignal[];
};

const fantasyProsCsv = `"RK",TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"
"1",1,"Josh Allen",BUF,"QB1","7","","","4 out of 5 stars","+8"
"2",1,"Jahmyr Gibbs",DET,"RB1","6","","","5 out of 5 stars","0"
"3",1,"A.J. Brown",PHI,"WR1","9","","","3 out of 5 stars","+2"`;
const fantasyProsQbProjectionsCsv = `"Player","Team","ATT","CMP","YDS","TDS","INTS","ATT","YDS","TDS","FL","FPTS"
"Josh Allen","BUF","500","330","4,000","30","10","100","500","10","2","365"`;
const fantasyProsAdpCsv = `Rank,Player (Bye),POS,Sleeper,RTSports,AVG,Real-Time
1,Jahmyr Gibbs DET (6),RB1,2,-,2.0,1
2,Josh Allen BUF (7),QB1,18,-,18.0,16`;

describe("draft recommendation routes", () => {
  it("rejects rankings for a different scoring format", async () => {
    const response = await app.request("/drafts/mock-draft/rankings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "fantasypros",
        scoring: "Standard",
        csvText: fantasyProsCsv,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The Standard rankings do not match this PPR league.",
    });
  });

  it("applies preference ids to mock draft recommendations", async () => {
    const baselineResponse = await app.request("/drafts/mock/recommendations");
    expect(baselineResponse.status).toBe(200);
    const baseline = (await baselineResponse.json()) as DraftRecommendation;
    const excludedId = baseline.candidates[0]?.player.id;
    expect(excludedId).toBeTruthy();

    const preferredResponse = await app.request("/drafts/mock/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendationPreferences: {
          excludedPlayerIds: excludedId ? [excludedId] : [],
          fadedPlayerIds: baseline.candidates[1] ? [baseline.candidates[1].player.id] : [],
        },
      }),
    });

    expect(preferredResponse.status).toBe(200);
    const preferred = (await preferredResponse.json()) as DraftRecommendation;

    expect(preferred.recommendedPlayerId).not.toBe(excludedId);
    expect(preferred.candidates.some((candidate) => candidate.player.id === excludedId)).toBe(false);
    expect(preferred.assumptions.some((assumption) => assumption.includes("Excluded players hidden"))).toBe(true);
    expect(preferred.assumptions.some((assumption) => assumption.includes("User faded"))).toBe(true);
  });

  it("supports the draft workflow from state load through import, preferences, and ask", async () => {
    const originalSettings = await getSettings();

    try {
      await updateSettings({ ...originalSettings, aiProvider: "noop" });
      await app.request("/drafts/mock-draft/rankings/import", { method: "DELETE" });
      await app.request("/drafts/mock-draft/projections/season/import", { method: "DELETE" });
      await app.request("/drafts/mock-draft/adp/import", { method: "DELETE" });

      const initialStateResponse = await app.request("/drafts/mock-draft/state");
      expect(initialStateResponse.status).toBe(200);
      const initialPayload = (await initialStateResponse.json()) as DraftPayload;
      expect(initialPayload.rankingImportSummary).toBeNull();
      expect(initialPayload.seasonProjectionImportSummary).toBeNull();
      expect(initialPayload.adpImportSummary).toBeNull();

      const initialDecisionsResponse = await app.request("/drafts/mock-draft/decisions?limit=5");
      expect(initialDecisionsResponse.status).toBe(200);
      const initialDecisions = (await initialDecisionsResponse.json()) as { snapshots: Array<{ trigger: string; recommendedPlayerId: string | null }> };
      expect(initialDecisions.snapshots.some((snapshot) => snapshot.trigger === "state-load")).toBe(true);

      const importResponse = await app.request("/drafts/mock-draft/rankings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "fantasypros", csvText: fantasyProsCsv }),
      });
      expect(importResponse.status).toBe(200);
      const importPayload = (await importResponse.json()) as DraftPayload & { summary: RankingImportSummary };
      expect(importPayload.summary.matched).toBe(3);
      expect(importPayload.rankingImportSummary?.matched).toBe(3);
      expect(importPayload.recommendation.assumptions[0]).toContain("Imported");
      expect(importPayload.recommendation.candidates[0]?.player.projectionSource).toBe("imported");

      const importedStateResponse = await app.request("/drafts/mock-draft/state");
      expect(importedStateResponse.status).toBe(200);
      const importedPayload = (await importedStateResponse.json()) as DraftPayload;
      expect(importedPayload.rankingImportSummary?.matched).toBe(3);
      expect(importedPayload.recommendation.candidates[0]?.reasons[0]).toContain("FantasyPros rank");

      const projectionResponse = await app.request("/drafts/mock-draft/projections/season/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "fantasypros",
          season: "2026",
          files: [{ position: "QB", csvText: fantasyProsQbProjectionsCsv }],
        }),
      });
      expect(projectionResponse.status).toBe(200);
      const projectionPayload = (await projectionResponse.json()) as DraftPayload & { summary: SeasonProjectionImportSummary };
      expect(projectionPayload.summary.matched).toBe(1);
      expect(projectionPayload.state.players.find((player) => player.name === "Josh Allen")).toMatchObject({
        projectionSource: "season_projection",
        seasonProjectionSeason: "2026",
      });

      const adpResponse = await app.request("/drafts/mock-draft/adp/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "fantasypros", season: "2026", csvText: fantasyProsAdpCsv }),
      });
      expect(adpResponse.status).toBe(200);
      const adpPayload = (await adpResponse.json()) as DraftPayload & { summary: AdpImportSummary };
      expect(adpPayload.summary.matched).toBe(2);
      expect(adpPayload.state.players.find((player) => player.name === "Josh Allen")).toMatchObject({
        adp: 18,
        realTimeAdp: 16,
      });

      const draftDataReloadResponse = await app.request("/drafts/mock-draft/state");
      const draftDataReload = (await draftDataReloadResponse.json()) as DraftPayload;
      expect(draftDataReload.rankingImportSummary?.matched).toBe(3);
      expect(draftDataReload.seasonProjectionImportSummary?.matched).toBe(1);
      expect(draftDataReload.adpImportSummary?.matched).toBe(2);

      const excludedId = importedPayload.recommendation.candidates[0]?.player.id;
      const fadedId = importedPayload.recommendation.candidates[1]?.player.id;
      expect(excludedId).toBeTruthy();
      expect(fadedId).toBeTruthy();

      const askResponse = await app.request("/drafts/mock-draft/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Who should I take if I do not want the current top option?",
          conversationHistory: [
            { role: "user", content: "I prefer RB/WR unless QB value is obvious." },
            { role: "assistant", content: "I will compare the top board candidates." },
          ],
          userPreferences: {
            excluded: [importedPayload.recommendation.candidates[0]?.player.name],
            faded: [importedPayload.recommendation.candidates[1]?.player.name],
          },
          recommendationPreferences: {
            excludedPlayerIds: excludedId ? [excludedId] : [],
            fadedPlayerIds: fadedId ? [fadedId] : [],
          },
        }),
      });

      expect(askResponse.status).toBe(200);
      const askPayload = (await askResponse.json()) as AskPayload;
      expect(askPayload.provider.id).toBe("noop");
      expect(askPayload.answer).toContain("neutral draft evidence");
      expect(askPayload.recommendation.recommendedPlayerId).not.toBe(excludedId);
      expect(askPayload.recommendation.candidates.some((candidate) => candidate.player.id === excludedId)).toBe(false);
      expect(askPayload.recommendation.assumptions.some((assumption) => assumption.includes("Excluded players hidden"))).toBe(true);
      expect(askPayload.recommendation.assumptions.some((assumption) => assumption.includes("User faded"))).toBe(true);

      const strategyResponse = await app.request("/drafts/mock-draft/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationPreferences: {
            excludedPlayerIds: excludedId ? [excludedId] : [],
            fadedPlayerIds: fadedId ? [fadedId] : [],
          },
        }),
      });
      expect(strategyResponse.status).toBe(200);
      const strategy = (await strategyResponse.json()) as StrategyPayload;
      expect(strategy.provider.id).toBe("noop");
      expect(strategy.decision.basedOnPick).toBe(strategy.pickNumber);
      expect(strategy.decision.recommendedPlayerId).toBe(strategy.recommendedCandidate.player.id);
      expect(strategy.decision.headline).toBe(`Take ${strategy.recommendedCandidate.player.name}`);
      expect(strategy.recommendedCandidate.player.id).not.toBe(excludedId);
      expect(strategy.alternativeCandidates.every((candidate) =>
        strategy.decision.alternativePlayerIds.includes(candidate.player.id)
      )).toBe(true);

      const recommendationIds = new Set(askPayload.recommendation.candidates.map((candidate) => candidate.player.id));
      const pickedIds = new Set(draftDataReload.state.picks.map((pick) => pick.playerId));
      const evaluationPlayer = draftDataReload.state.players.find(
        (player) =>
          !pickedIds.has(player.id) &&
          !recommendationIds.has(player.id) &&
          player.id !== excludedId,
      );
      expect(evaluationPlayer).toBeTruthy();
      const evaluationResponse = await app.request(
        `/drafts/mock-draft/candidates/${evaluationPlayer!.id}/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recommendationPreferences: {
              excludedPlayerIds: excludedId ? [excludedId] : [],
              fadedPlayerIds: fadedId ? [fadedId] : [],
            },
          }),
        },
      );
      expect(evaluationResponse.status).toBe(200);
      const evaluation = (await evaluationResponse.json()) as CandidateEvaluationPayload;
      expect(evaluation).toMatchObject({
        playerId: evaluationPlayer!.id,
        playerName: evaluationPlayer!.name,
        pickNumber: expect.any(Number),
        provider: { id: "noop" },
      });
      expect(evaluation.answer).toContain("neutral draft evidence");

      const unavailableEvaluation = await app.request("/drafts/mock-draft/candidates/not-available/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(unavailableEvaluation.status).toBe(409);
      expect(await unavailableEvaluation.json()).toEqual({
        error: "That player is no longer available for this draft pick.",
      });

      const decisionResponse = await app.request("/drafts/mock-draft/decisions?limit=10");
      expect(decisionResponse.status).toBe(200);
      const decisions = (await decisionResponse.json()) as { snapshots: Array<{ trigger: string; recommendedPlayerId: string | null }> };
      expect(decisions.snapshots.some((snapshot) => snapshot.trigger === "rankings-import")).toBe(true);
      expect(decisions.snapshots.some((snapshot) => snapshot.trigger === "ai-question")).toBe(true);
      expect(decisions.snapshots.some((snapshot) => snapshot.trigger === "ai-strategy")).toBe(true);
      expect(decisions.snapshots.some((snapshot) => snapshot.trigger === "candidate-evaluation")).toBe(true);
    } finally {
      await app.request("/drafts/mock-draft/rankings/import", { method: "DELETE" });
      await app.request("/drafts/mock-draft/projections/season/import", { method: "DELETE" });
      await app.request("/drafts/mock-draft/adp/import", { method: "DELETE" });
      await updateSettings(originalSettings);
    }
  });
  it("returns redacted diagnostics for support", async () => {
    const response = await app.request("/diagnostics");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      service: string;
      capabilities: { sqliteStorage?: boolean };
      settings: { aiProvider: string; codexBinConfigured: boolean; codexModel: string; codexTimeoutMs: number };
      storage: { sqliteStorage: boolean; settingsRecords: number; rankingImportRecords: number; decisionSnapshots: number };
      runtime: { node: string; platform: string; arch: string; packagedDataDir: boolean };
    };

    expect(payload.ok).toBe(true);
    expect(payload.service).toBe("sleeper-ai-api");
    expect(payload.capabilities.sqliteStorage).toBe(true);
    expect(payload.settings.codexBinConfigured).toBe(true);
    expect(payload.storage.sqliteStorage).toBe(true);
    expect(payload.storage.settingsRecords).toBeGreaterThanOrEqual(1);
    expect(payload.runtime.node).toMatch(/^v/);
    expect(JSON.stringify(payload)).not.toContain("accessToken");
    expect(JSON.stringify(payload)).not.toContain("refreshToken");
  });
});

async function getSettings(): Promise<AppSettings> {
  const response = await app.request("/settings");
  expect(response.status).toBe(200);
  return (await response.json()) as AppSettings;
}

async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  const response = await app.request("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as AppSettings;
}

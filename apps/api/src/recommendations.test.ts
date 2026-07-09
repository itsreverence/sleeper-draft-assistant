import type { AppSettings, DraftRecommendation, DraftState, RankingImportSummary } from "@sleeper-ai/shared";
import { describe, expect, it } from "vitest";

import { app } from "./index";

type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
};

type AskPayload = {
  answer: string;
  recommendation: DraftRecommendation;
  provider: { id: string; label: string; configured: boolean };
};

const fantasyProsCsv = `"RK",TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"
"1",1,"Josh Allen",BUF,"QB1","7","","","4 out of 5 stars","+8"
"2",1,"Jahmyr Gibbs",DET,"RB1","6","","","5 out of 5 stars","0"
"3",1,"A.J. Brown",PHI,"WR1","9","","","3 out of 5 stars","+2"`;

describe("draft recommendation routes", () => {
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

      const initialStateResponse = await app.request("/drafts/mock-draft/state");
      expect(initialStateResponse.status).toBe(200);
      const initialPayload = (await initialStateResponse.json()) as DraftPayload;
      expect(initialPayload.rankingImportSummary).toBeNull();

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
      expect(askPayload.answer).toContain("deterministic draft context");
      expect(askPayload.recommendation.recommendedPlayerId).not.toBe(excludedId);
      expect(askPayload.recommendation.candidates.some((candidate) => candidate.player.id === excludedId)).toBe(false);
      expect(askPayload.recommendation.assumptions.some((assumption) => assumption.includes("Excluded players hidden"))).toBe(true);
      expect(askPayload.recommendation.assumptions.some((assumption) => assumption.includes("User faded"))).toBe(true);

      const decisionResponse = await app.request("/drafts/mock-draft/decisions?limit=10");
      expect(decisionResponse.status).toBe(200);
      const decisions = (await decisionResponse.json()) as { snapshots: Array<{ trigger: string; recommendedPlayerId: string | null }> };
      expect(decisions.snapshots.some((snapshot) => snapshot.trigger === "rankings-import")).toBe(true);
      expect(decisions.snapshots.some((snapshot) => snapshot.trigger === "ai-question")).toBe(true);
    } finally {
      await updateSettings(originalSettings);
    }
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

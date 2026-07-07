import type { DraftRecommendation } from "@sleeper-ai/shared";
import { describe, expect, it } from "vitest";

import { app } from "./index";

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
});

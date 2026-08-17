import { describe, expect, it } from "vitest";

import { app } from "./index";

const expectedRoutes = [
  "GET /health",
  "GET /diagnostics",
  "GET /data",
  "GET /data/support-report",
  "DELETE /data/:category",
  "POST /data/reset",
  "GET /settings",
  "PUT /settings",
  "GET /ai/status",
  "GET /drafts/:draftId/strategy-instructions",
  "POST /drafts/:draftId/strategy-instructions",
  "PUT /drafts/:draftId/strategy-instructions/:instructionId",
  "DELETE /drafts/:draftId/strategy-instructions/:instructionId",
  "GET /drafts/mock/state",
  "GET /sleeper/connect",
  "GET /leagues/:leagueId/team",
  "POST /leagues/:leagueId/team/ask",
  "GET /leagues/:leagueId/rankings/ros",
  "POST /leagues/:leagueId/rankings/ros/import",
  "DELETE /leagues/:leagueId/rankings/ros",
  "GET /leagues/:leagueId/projections/weekly",
  "POST /leagues/:leagueId/projections/weekly/import",
  "DELETE /leagues/:leagueId/projections/weekly",
  "GET /drafts/:draftId/state",
  "POST /drafts/:draftId/rankings/import",
  "POST /drafts/:draftId/projections/season/import",
  "DELETE /drafts/:draftId/projections/season/import",
  "POST /drafts/:draftId/adp/import",
  "DELETE /drafts/:draftId/adp/import",
  "DELETE /drafts/:draftId/rankings/import",
  "GET /drafts/:draftId/recommendations",
  "POST /drafts/:draftId/recommendations",
  "POST /drafts/:draftId/strategy",
  "POST /drafts/:draftId/ask",
  "POST /drafts/:draftId/candidates/:playerId/evaluate",
  "GET /drafts/:draftId/decisions",
  "GET /drafts/:draftId/events",
] as const;

describe("API route inventory", () => {
  it("keeps the public method and path surface stable", () => {
    const routes = app.routes
      .filter((route) => route.path !== "/*")
      .map((route) => `${route.method} ${route.path}`);

    expect(routes).toEqual(expectedRoutes);
  });
});

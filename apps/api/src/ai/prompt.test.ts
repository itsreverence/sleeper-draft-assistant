import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import { buildDraftQuestionContext, buildDraftStrategyContext } from "./context";
import { buildDraftManagerInstructions, buildDraftManagerPrompt, buildDraftStrategyPrompt } from "./prompt";

describe("draft manager prompt", () => {
  it("gives draft questions neutral evidence and player search guidance", () => {
    const state = createMockDraftState(0);
    const context = buildDraftQuestionContext(state, "What roster need matters most?");

    const prompt = buildDraftManagerPrompt(context);

    expect(prompt).toContain("Neutral draft evidence JSON:");
    expect(prompt).toContain("search_available_players");
    expect(prompt).toContain("playerEvidenceGroups");
    expect(prompt).toContain("playerEvidence");
    expect(prompt).toContain("openDirectStarterSlots");
    expect(prompt).not.toContain("engineLean");
    expect(prompt).not.toContain("draftBrief");
    expect(prompt).not.toContain('"score"');
  });

  it("instructs providers to reason independently from distinct evidence", () => {
    const instructions = buildDraftManagerInstructions();

    expect(instructions).toContain("Independently answer");
    expect(instructions).toContain("neutral catalog");
    expect(instructions).toContain("Use search_available_players");
    expect(instructions).toContain("Do not invent player projections");
  });

  it("gives the primary strategist neutral evidence and player search instead of an engine lean", () => {
    const prompt = buildDraftStrategyPrompt(buildDraftStrategyContext(createMockDraftState(8)));

    expect(prompt).toContain("playerEvidence is an alphabetically ordered catalog");
    expect(prompt).toContain("separate pinned, ECR, projection, ADP, Sleeper search-rank fallback, and position-coverage retrievals");
    expect(prompt).toContain("Use search_available_players proactively");
    expect(prompt).toContain("openDirectStarterSlots");
    expect(prompt).not.toContain("engineLean");
    expect(prompt).not.toContain('"score"');
    expect(prompt).not.toContain("deterministic order");
  });
});

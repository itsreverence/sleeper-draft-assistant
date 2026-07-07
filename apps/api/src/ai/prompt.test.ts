import { buildDraftRecommendation, createMockDraftState } from "@sleeper-ai/engine";
import { describe, expect, it } from "vitest";

import { buildDraftAiContext } from "./context";
import { buildDraftManagerInstructions, buildDraftManagerPrompt } from "./prompt";

describe("draft manager prompt", () => {
  it("puts the draft brief contract before the full context", () => {
    const state = createMockDraftState(0);
    const recommendation = buildDraftRecommendation(state);
    const context = buildDraftAiContext(state, recommendation, "What roster need matters most?");

    const prompt = buildDraftManagerPrompt(context);

    expect(prompt).toContain("Draft brief contract JSON:");
    expect(prompt).toContain("Full draft context JSON:");
    expect(prompt.indexOf("Draft brief contract JSON:")).toBeLessThan(prompt.indexOf("Full draft context JSON:"));
    expect(prompt).toContain("draftBrief.primaryDecisionGuidance");
    expect(prompt).toContain("RB/WR depth has extra importance because FLEX slots increase weekly starter demand.");
    expect(prompt).toContain("Use imported rankings as ranks/tiers only; do not call them projections unless true projections are present.");
  });

  it("instructs providers to resolve conflicts instead of parroting the engine", () => {
    const instructions = buildDraftManagerInstructions();

    expect(instructions).toContain("Use draftBrief first");
    expect(instructions).toContain("explain the conflict plainly instead of forcing agreement");
    expect(instructions).toContain("Do not invent player projections");
  });
});

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
    expect(prompt).toContain("compare_players");
    expect(prompt).toContain("inspect_position_market");
    expect(prompt).toContain("playerEvidenceGroups");
    expect(prompt).toContain("playerEvidence");
    expect(prompt).toContain("openDirectStarterSlots");
    expect(prompt).toContain("pickOrderSource");
    expect(prompt).toContain("board.teamRosters");
    expect(prompt).not.toContain("engineLean");
    expect(prompt).not.toContain("draftBrief");
    expect(prompt).not.toContain("toolInstructions");
    expect(prompt).not.toContain('"score"');
    expect(prompt.match(/search_available_players/g)).toHaveLength(1);
    expect(prompt).toContain("<strategy_proposal>");
    expect(prompt).toContain("never claim it was applied");
  });

  it("keeps reusable draft instructions concise and focused on hard boundaries", () => {
    const instructions = buildDraftManagerInstructions();

    expect(instructions).toContain("independent fantasy football draft manager");
    expect(instructions).toContain("separate raw signals");
    expect(instructions).toContain("never recommend an unavailable or excluded player");
    expect(instructions).not.toContain("search_available_players");
  });

  it("gives the primary strategist neutral evidence and player search instead of an engine lean", () => {
    const prompt = buildDraftStrategyPrompt(buildDraftStrategyContext(createMockDraftState(8)));

    expect(prompt).toContain("evidence groups are separate raw signals");
    expect(prompt).toContain("Use search_available_players when");
    expect(prompt).toContain("compare_players");
    expect(prompt).toContain("inspect_position_market");
    expect(prompt).toContain("openDirectStarterSlots");
    expect(prompt).toContain("pickOrderSource");
    expect(prompt).not.toContain("engineLean");
    expect(prompt).not.toContain("toolInstructions");
    expect(prompt).not.toContain("The backend will reject");
    expect(prompt).not.toContain('"score"');
    expect(prompt).not.toContain("deterministic order");
    expect(prompt.match(/search_available_players/g)).toHaveLength(1);
  });

  it("assigns non-overlapping jobs to draft decision fields", () => {
    const prompt = buildDraftStrategyPrompt(buildDraftStrategyContext(createMockDraftState(8)));

    expect(prompt).toContain("UI separately renders the recommended player's raw evidence");
    expect(prompt).toContain("Give every generated field a distinct purpose");
    expect(prompt).toContain("summary: one or two live-pick-clock sentences");
    expect(prompt).toContain("reasons: two or three distinct comparative or strategic reasons");
    expect(prompt).toContain("do not re-list ranks, projections, ADP, tiers, or flags");
    expect(prompt).toContain("risks: only material decision implications");
    expect(prompt).toContain("paired with its consequence or mitigation");
    expect(prompt).toContain("begin after the recommended selection");
    expect(prompt).toContain("do not re-justify or restate the current recommendation");
    expect(prompt).toContain("complete but non-redundant living draft plan");
  });
});

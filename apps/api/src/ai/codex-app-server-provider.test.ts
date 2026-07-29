import { describe, expect, it, vi } from "vitest";

import { executeDynamicToolCall, parseAiDraftDecision, resolveCodexLaunch, toDynamicToolDefinitions } from "./codex-app-server-provider";

describe("Codex app-server executable resolution", () => {
  it("uses codex.exe for bare Windows launcher names", () => {
    const launch = {
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"],
    };
    const findLaunch = vi.fn(() => launch);

    expect(resolveCodexLaunch("codex", "win32", findLaunch)).toEqual(launch);
    expect(resolveCodexLaunch("codex.cmd", "win32", findLaunch)).toEqual(launch);
    expect(findLaunch).toHaveBeenCalledTimes(2);
  });

  it("keeps explicit executable paths and non-Windows commands unchanged", () => {
    expect(resolveCodexLaunch("C:\\Codex\\codex.exe", "win32")).toEqual({
      command: "C:\\Codex\\codex.exe",
      args: [],
    });
    expect(resolveCodexLaunch("/usr/local/bin/codex", "linux")).toEqual({
      command: "/usr/local/bin/codex",
      args: [],
    });
  });

  it("parses a structured strategy response and rejects unknown shapes", () => {
    const decision = parseAiDraftDecision(`\`\`\`json
      {
        "basedOnPick": 12,
        "recommendedPlayerId": "player-1",
        "alternativePlayerIds": ["player-2"],
        "verdict": "strong",
        "confidence": "high",
        "headline": "Take Player One",
        "summary": "Best fit and value.",
        "reasons": ["Fills RB need"],
        "risks": [],
        "plan": {
          "updatedAtPick": 12,
          "approach": "Build a balanced RB/WR core.",
          "currentPickFocus": ["RB"],
          "nextTurnPriorities": ["WR"],
          "positionsThatCanWait": ["QB", "TE"],
          "rosterGoals": ["Add a second starting receiver."],
          "watchItems": ["Monitor the next WR tier."],
          "changeSummary": "Initial plan created."
        }
      }
    \`\`\``);

    expect(decision.recommendedPlayerId).toBe("player-1");
    expect(decision.plan.nextTurnPriorities).toEqual(["WR"]);
    expect(() => parseAiDraftDecision('{"recommendedPlayerId":"player-1"}')).toThrow("invalid draft decision");
  });

  it("passes provider-neutral tool definitions through to app-server", () => {
    const definitions = toDynamicToolDefinitions([
      {
        definition: {
          type: "function",
          name: "search_available_players",
          description: "Search players.",
          inputSchema: { type: "object" },
        },
        execute: vi.fn(),
      },
    ]);

    expect(definitions).toEqual([
      {
        type: "function",
        name: "search_available_players",
        description: "Search players.",
        inputSchema: { type: "object" },
      },
    ]);
  });

  it("returns dynamic tool results as app-server input text", async () => {
    const tool = {
      definition: {
        type: "function" as const,
        name: "search_available_players",
        description: "Search players.",
        inputSchema: { type: "object" },
      },
      execute: vi.fn(async () => ({ basedOnPick: 12, players: [{ playerId: "k-1" }] })),
    };

    const result = await executeDynamicToolCall(
      new Map([[tool.definition.name, tool]]),
      "search_available_players",
      { positions: ["K"] },
    );

    expect(result.success).toBe(true);
    expect(result.contentItems[0]?.type).toBe("inputText");
    expect(JSON.parse(result.contentItems[0]!.text)).toMatchObject({
      basedOnPick: 12,
      players: [{ playerId: "k-1" }],
    });
    expect(tool.execute).toHaveBeenCalledWith({ positions: ["K"] });
  });
});

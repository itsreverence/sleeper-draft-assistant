import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it, vi } from "vitest";

import { buildDraftQuestionContext } from "./context";
import { CodexAppServerProvider, executeDynamicToolCall, parseAiDraftDecision, parseDraftQuestionAnswer, resolveCodexLaunch, toDynamicToolDefinitions, type CodexAppServerClient } from "./codex-app-server-provider";

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

  it("extracts an explicit strategy proposal without treating it as already applied", () => {
    expect(parseDraftQuestionAnswer(`Favoring Bears players is reasonable when the value is close.
<strategy_proposal>{"text":"Favor Bears players when value is close.","scope":"draft"}</strategy_proposal>`)).toEqual({
      answer: "Favoring Bears players is reasonable when the value is close.",
      strategyProposal: {
        text: "Favor Bears players when value is close.",
        scope: "draft",
      },
    });
  });

  it("drops malformed strategy proposal markup while preserving the answer", () => {
    expect(parseDraftQuestionAnswer("I can account for that.\n<strategy_proposal>not-json</strategy_proposal>")).toEqual({
      answer: "I can account for that.",
    });
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

  it("reuses one app-server thread and omits duplicated conversation history", async () => {
    const client = new FakeCodexClient();
    const provider = new CodexAppServerProvider({
      clientFactory: async () => client,
    });
    const context = buildDraftQuestionContext(
      createMockDraftState(0),
      "Who should I draft?",
      [{ role: "user", content: "Previous question" }],
    );

    await provider.answerDraftQuestion(context);
    await provider.answerDraftQuestion(context);

    expect(client.initializeCalls).toBe(1);
    expect(client.threadStartCalls).toBe(1);
    expect(client.turnThreadIds).toEqual(["thread-1", "thread-1"]);
    expect(client.prompts[0]).toContain("Previous question");
    expect(client.prompts[1]).toContain('"conversationHistory": []');

    provider.close();
    expect(client.closed).toBe(true);
  });

  it("restarts with a fresh thread after a failed turn", async () => {
    const firstClient = new FakeCodexClient();
    firstClient.failNextTurn = true;
    const secondClient = new FakeCodexClient();
    const clientFactory = vi.fn()
      .mockResolvedValueOnce(firstClient)
      .mockResolvedValueOnce(secondClient);
    const provider = new CodexAppServerProvider({ clientFactory });
    const context = buildDraftQuestionContext(createMockDraftState(0), "Who should I draft?");

    await expect(provider.answerDraftQuestion(context)).rejects.toThrow("Turn failed");
    await expect(provider.answerDraftQuestion(context)).resolves.toMatchObject({
      answer: "Grounded answer.",
    });

    expect(firstClient.closed).toBe(true);
    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(secondClient.threadStartCalls).toBe(1);
  });
});

class FakeCodexClient implements CodexAppServerClient {
  initializeCalls = 0;
  threadStartCalls = 0;
  turnThreadIds: string[] = [];
  prompts: string[] = [];
  closed = false;
  failNextTurn = false;

  async initialize(): Promise<void> {
    this.initializeCalls += 1;
  }

  async request<T>(method: string): Promise<T> {
    if (method === "thread/start") {
      this.threadStartCalls += 1;
      return { thread: { id: `thread-${this.threadStartCalls}` } } as T;
    }
    return {} as T;
  }

  async runTurn(threadId: string, prompt: string): Promise<string> {
    this.turnThreadIds.push(threadId);
    this.prompts.push(prompt);
    if (this.failNextTurn) {
      this.failNextTurn = false;
      throw new Error("Turn failed");
    }
    return "Grounded answer.";
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    this.closed = true;
  }
}

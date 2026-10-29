import { spawn } from "node:child_process";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it, vi } from "vitest";

import { buildDraftQuestionContext } from "./context";
import { newsDomains } from "./player-news";
import type { AiTool } from "./types";
import { CodexAppServerProvider, attachCodexAppServerProcess, executeDynamicToolCall, parseAiDraftDecision, parseDraftQuestionAnswer, findCodexLaunchOnWindows, resolveCodexLaunch, toDynamicToolDefinitions, type CodexAppServerClient, type CodexTurnOptions } from "./codex-app-server-provider";

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

  it("falls back to npm's default global launcher when PATH lacks it", () => {
    const appData = "C:\\Users\\desktop\\AppData\\Roaming";
    const files = new Set([
      `${appData}\\npm\\codex.cmd`,
      `${appData}\\npm\\node_modules\\@openai\\codex\\bin\\codex.js`,
    ]);
    const findCommand = vi.fn((command: string) =>
      command === "node.exe" ? "C:\\Program Files\\nodejs\\node.exe" : null);

    expect(findCodexLaunchOnWindows({ findCommand, fileExists: (file) => files.has(file), appData })).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [`${appData}\\npm\\node_modules\\@openai\\codex\\bin\\codex.js`],
    });
  });

  it("prefers PATH and reports a missing Codex when no launcher exists", () => {
    const pathLauncher = "D:\\tools\\npm\\codex.cmd";
    const fileExists = vi.fn((file: string) => file.startsWith("D:\\tools\\npm\\"));
    const findCommand = (command: string) =>
      command === "codex.cmd" ? pathLauncher : command === "node.exe" ? "C:\\node.exe" : null;

    expect(findCodexLaunchOnWindows({ findCommand, fileExists, appData: "C:\\AppData" }).args)
      .toEqual(["D:\\tools\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"]);
    expect(fileExists).not.toHaveBeenCalledWith("C:\\AppData\\npm\\codex.cmd");
    expect(() => findCodexLaunchOnWindows({ findCommand: () => null, fileExists: () => false, appData: "C:\\AppData" }))
      .toThrow("Windows could not locate the Codex CLI");
    expect(() => findCodexLaunchOnWindows({ findCommand: () => null, fileExists: () => true, appData: undefined }))
      .toThrow("Windows could not locate the Codex CLI");
  });

  it("skips a non-npm default launcher and falls through to codex.exe", () => {
    const findCommand = (command: string) => command === "codex.exe" ? "C:\\Codex\\codex.exe" : null;
    const fileExists = (file: string) => file === "C:\\AppData\\npm\\codex.cmd";

    expect(findCodexLaunchOnWindows({ findCommand, fileExists, appData: "C:\\AppData" }))
      .toEqual({ command: "C:\\Codex\\codex.exe", args: [] });
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

  it.each(["fast", "default"] as const)("starts Codex threads with the %s response speed", async (serviceTier) => {
    const client = new FakeCodexClient();
    const provider = new CodexAppServerProvider({
      serviceTier,
      clientFactory: async () => client,
    });
    const context = buildDraftQuestionContext(createMockDraftState(0), "Who should I draft?");

    await provider.answerDraftQuestion(context);

    expect(client.threadStartParams).toHaveLength(1);
    expect(client.threadStartParams[0]).toMatchObject({ serviceTier });
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

    await expect(provider.answerDraftQuestion(context)).rejects.toMatchObject({
      code: "codex_request_failed",
      publicMessage: expect.stringContaining("could not complete the request"),
    });
    await expect(provider.answerDraftQuestion(context)).resolves.toMatchObject({
      answer: "Grounded answer.",
    });

    expect(firstClient.closed).toBe(true);
    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(secondClient.threadStartCalls).toBe(1);
  });

  it("reports an unusable Codex installation without exposing its raw startup error", async () => {
    const provider = new CodexAppServerProvider({
      clientFactory: async () => {
        throw new Error("C:\\Users\\private-user\\.codex\\config.toml contains an invalid service tier");
      },
    });

    await expect(provider.checkStatus()).resolves.toMatchObject({
      id: "codex-app-server",
      label: "Codex",
      configured: true,
      availability: "unavailable",
      detail: expect.stringContaining("Codex could not start"),
    });
    expect(provider.status().detail).not.toContain("private-user");
    expect(provider.status().detail).not.toContain("config.toml");
  });

  it("lets the model request isolated news without exposing private context to the research thread", async () => {
    const main = new FakeCodexClient();
    const research = new FakeCodexClient();
    const context = buildDraftQuestionContext(createMockDraftState(0), "Private league question");
    const player = context.playerEvidence[0]!;
    main.runTurn = async (_thread, _prompt, tools: AiTool[] = []) => {
      const news = tools.find((tool) => tool.definition.name === "check_player_news")!;
      expect(await news.execute({ playerId: player.playerId, topic: "injury" })).toMatchObject({ status: "available" });
      return "Consider the report alongside your projections.";
    };
    research.runTurn = async (_thread, prompt) => {
      expect(prompt).toContain(player.name);
      expect(prompt).not.toContain("Private league question");
      expect(prompt).not.toContain(context.draft.id);
      return JSON.stringify({ summary: "Status uncertain.", sources: [{ title: "Report", url: "https://www.nfl.com/news/report", reportedAt: new Date().toISOString().slice(0, 10) }] });
    };
    const provider = new CodexAppServerProvider({ clientFactory: vi.fn().mockResolvedValueOnce(main).mockResolvedValueOnce(research) });
    const result = await provider.answerDraftQuestion(context);
    const disabledFeatures = {
      "features.apps": false,
      "features.plugins": false,
      "features.remote_plugin": false,
      "features.browser_use": false,
      "features.browser_use_external": false,
      "features.browser_use_full_cdp_access": false,
      "features.browser_annotation_api": false,
      "features.in_app_browser": false,
      "features.computer_use": false,
      "features.in_app_local_automation": false,
      "features.shell_tool": false,
      "features.unified_exec": false,
      "features.unified_exec_tty": false,
      "features.code_mode_host": false,
      "features.multi_agent": false,
      "features.image_generation": false,
      "features.view_image": false,
      "features.skill_search": false,
      "features.skill_mcp_dependency_install": false,
      "features.hooks": false,
      "features.goals": false,
      "features.worktrees": false,
      "features.tool_suggest": false,
      "features.sleep_tool": false,
    };
    expect(main.threadStartParams[0]?.config).toEqual({
      "features.apps": false,
      "features.plugins": false,
      "features.remote_plugin": false,
      "features.browser_use": false,
      "features.browser_use_external": false,
      "features.browser_use_full_cdp_access": false,
      "features.browser_annotation_api": false,
      "features.in_app_browser": false,
      "features.computer_use": false,
      "features.in_app_local_automation": false,
      "features.shell_tool": false,
      "features.unified_exec": false,
      "features.unified_exec_tty": false,
      web_search: "disabled",
    });
    expect(research.threadStartParams[0]?.config).toEqual({
      ...disabledFeatures,
      web_search: "live",
      "tools.web_search.allowed_domains": newsDomains,
    });
    expect(research.threadStartParams[0]).toMatchObject({ ephemeral: true, sandbox: "read-only", approvalPolicy: "never" });
    expect(result.answer).toContain("https://www.nfl.com/news/report");
    expect(research.closed).toBe(true);
    expect(main.closed).toBe(false);
    expect(provider.newsDiagnostics()).toEqual([{ outcome: "available", elapsedMs: expect.any(Number), rejectedSources: expect.any(Object) }]);
    provider.close();
  });

  it.each([
    [60_000, 45_000],
    [10_000, 10_000],
    [120_000, 45_000],
  ])("derives lookup and answer budgets together for a %i ms main timeout", async (timeoutMs, lookupMs) => {
    const main = new FakeCodexClient();
    const research = new FakeCodexClient();
    research.runTurn = async () => '{"summary":"No reporting","sources":[]}';
    const context = buildDraftQuestionContext(createMockDraftState(0), "fixture");
    main.runTurn = async (_thread, _prompt, tools = []) => {
      await tools.find((tool) => tool.definition.name === "check_player_news")!.execute({ playerId: context.playerEvidence[0]!.playerId, topic: "injury" });
      return "Evidence gap.";
    };
    const turn = vi.spyOn(main, "runTurn");
    const factory = vi.fn().mockResolvedValueOnce(main).mockResolvedValueOnce(research);
    const provider = new CodexAppServerProvider({ timeoutMs, clientFactory: factory });
    try {
      await provider.answerDraftQuestion(context);
      expect(factory).toHaveBeenNthCalledWith(2, "codex", lookupMs);
      expect(turn.mock.calls[0]?.[3]).toEqual({ toolWaitMs: 2 * lookupMs });
      expect(research.closed).toBe(true);
    } finally { provider.close(); }
  });

  it.each(["initialize", "thread/start"])("cancels and closes research during %s", async (phase) => {
    const main = new FakeCodexClient();
    const research = new FakeCodexClient();
    const started = deferred<void>();
    const blocked = deferred<never>();
    if (phase === "initialize") research.initialize = () => { started.resolve(); return blocked.promise; };
    else research.request = () => { started.resolve(); return blocked.promise; };
    research.close = () => { research.closed = true; blocked.reject(Error("private provider error")); };
    const context = buildDraftQuestionContext(createMockDraftState(0), "fixture");
    main.runTurn = async (_thread, _prompt, tools = []) => {
      await tools.find((tool) => tool.definition.name === "check_player_news")!.execute({ playerId: context.playerEvidence[0]!.playerId, topic: "injury" });
      return "Evidence gap.";
    };
    const provider = new CodexAppServerProvider({ clientFactory: vi.fn().mockResolvedValueOnce(main).mockResolvedValueOnce(research) });
    const result = provider.answerDraftQuestion(context);
    await started.promise;
    provider.close();
    await result;
    expect(research.closed).toBe(true);
    expect(provider.newsDiagnostics()).toEqual([{ outcome: "cancelled", elapsedMs: expect.any(Number), rejectedSources: expect.any(Object) }]);
  });

  it("bounds client creation and closes a client that arrives after the lookup deadline", async () => {
    const main = new FakeCodexClient();
    const research = new FakeCodexClient();
    const created = deferred<CodexAppServerClient>();
    const started = deferred<void>();
    const context = buildDraftQuestionContext(createMockDraftState(0), "fixture");
    main.runTurn = async (_thread, _prompt, tools = []) => {
      await tools.find((tool) => tool.definition.name === "check_player_news")!.execute({ playerId: context.playerEvidence[0]!.playerId, topic: "injury" });
      return "Evidence gap.";
    };
    const factory = vi.fn().mockResolvedValueOnce(main).mockImplementationOnce(() => { started.resolve(); return created.promise; });
    const provider = new CodexAppServerProvider({ timeoutMs: 1000, clientFactory: factory });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      const result = provider.answerDraftQuestion(context);
      await started.promise;
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toMatchObject({ answer: "Evidence gap." });
      expect(provider.newsDiagnostics()).toEqual([{ outcome: "timeout", elapsedMs: 1000, rejectedSources: expect.any(Object) }]);
      created.resolve(research);
      await vi.advanceTimersByTimeAsync(0);
      expect(research.initializeCalls).toBe(0);
      expect(research.closed).toBe(true);
    } finally { provider.close(); vi.useRealTimers(); }
  });

  it("closes a late-created research client without initializing after cancellation", async () => {
    const main = new FakeCodexClient();
    const research = new FakeCodexClient();
    const created = deferred<CodexAppServerClient>();
    const started = deferred<void>();
    const context = buildDraftQuestionContext(createMockDraftState(0), "fixture");
    main.runTurn = async (_thread, _prompt, tools = []) => {
      await tools.find((tool) => tool.definition.name === "check_player_news")!.execute({ playerId: context.playerEvidence[0]!.playerId, topic: "injury" });
      return "Evidence gap.";
    };
    const factory = vi.fn().mockResolvedValueOnce(main).mockImplementationOnce(() => { started.resolve(); return created.promise; });
    const provider = new CodexAppServerProvider({ clientFactory: factory });
    const result = provider.answerDraftQuestion(context);
    await started.promise;
    provider.close();
    created.resolve(research);
    await result;
    expect(research.initializeCalls).toBe(0);
    expect(research.closed).toBe(true);
    expect(provider.newsDiagnostics()).toEqual([{ outcome: "cancelled", elapsedMs: expect.any(Number), rejectedSources: expect.any(Object) }]);
  });

  it.each(["timeout", "cancelled"] as const)("records %s without retaining provider errors and closes research", async (outcome) => {
    const main = new FakeCodexClient();
    const research = new FakeCodexClient();
    const context = buildDraftQuestionContext(createMockDraftState(0), "private question");
    let rejectResearch: (error: Error) => void = () => undefined;
    research.runTurn = vi.fn(() => new Promise<string>((_resolve, reject) => { rejectResearch = reject; }));
    research.close = () => { research.closed = true; rejectResearch(new Error("private provider path and credentials")); };
    main.runTurn = async (_thread, _prompt, tools: AiTool[] = []) => {
      const news = tools.find((tool) => tool.definition.name === "check_player_news")!;
      expect(await news.execute({ playerId: context.playerEvidence[0]!.playerId, topic: "injury" })).toMatchObject({ status: "unavailable" });
      return "News unavailable.";
    };
    const provider = new CodexAppServerProvider({ timeoutMs: outcome === "timeout" ? 30 : 10000,
      clientFactory: vi.fn().mockResolvedValueOnce(main).mockResolvedValueOnce(research) });
    try {
      const answer = provider.answerDraftQuestion(context);
      await vi.waitFor(() => expect(research.runTurn).toHaveBeenCalled(), { interval: 1 });
      if (outcome === "cancelled") provider.close();
      await answer;
      expect(provider.newsDiagnostics()).toEqual([{ outcome, elapsedMs: expect.any(Number), rejectedSources: expect.any(Object) }]);
      expect(research.closed).toBe(true);
      expect(JSON.stringify(provider.newsDiagnostics())).not.toContain("private");
    } finally { provider.close(); }
  });

  it("keeps only 20 recent news outcomes and returns detached diagnostic copies", async () => {
    const main = new FakeCodexClient();
    const context = buildDraftQuestionContext(createMockDraftState(0), "public fixture");
    main.runTurn = async (_thread, _prompt, tools: AiTool[] = []) => {
      await tools.find((tool) => tool.definition.name === "check_player_news")!.execute({ playerId: context.playerEvidence[0]!.playerId, topic: "injury" });
      return "No current news.";
    };
    const factory = vi.fn(async () => {
      const research = new FakeCodexClient();
      research.runTurn = async () => '{"summary":"Private summary","sources":[{"title":"Private title","url":"https://nfl.com/news/private","reportedAt":null}]}';
      return research;
    }).mockResolvedValueOnce(main);
    const provider = new CodexAppServerProvider({ clientFactory: factory });
    try {
      for (let i = 0; i < 22; i++) await provider.answerDraftQuestion(context);
      const entries = provider.newsDiagnostics();
      expect(entries).toHaveLength(20);
      entries[0]!.outcome = "available";
      entries[0]!.rejectedSources.missing_date = 99;
      expect(provider.newsDiagnostics()[0]).toMatchObject({ outcome: "invalid_date", rejectedSources: { missing_date: 1 } });
      expect(JSON.stringify(provider.newsDiagnostics())).not.toMatch(/Private|https|private/);
    } finally { provider.close(); }
  });

  it("removes news capability and historical chat evidence when search is disabled", async () => {
    const client = new FakeCodexClient();
    const runTurn = vi.spyOn(client, "runTurn");
    const factory = vi.fn(async () => client);
    const provider = new CodexAppServerProvider({ webSearch: false, clientFactory: factory });
    const context = buildDraftQuestionContext(createMockDraftState(0), "Compare my players", [{ role: "assistant", content: "Old web report" }]);
    await provider.answerDraftQuestion(context);
    expect(client.threadStartParams[0]).toMatchObject({ config: { web_search: "disabled" }, dynamicTools: [] });
    expect(runTurn.mock.calls[0]?.[1]).toContain("Web search is disabled");
    expect(runTurn.mock.calls[0]?.[1]).not.toContain("Old web report");
    expect(runTurn.mock.calls[0]?.[2]).toEqual([]);
    expect(runTurn.mock.calls[0]?.[3]).toEqual({ toolWaitMs: 0 });
    expect(factory).toHaveBeenCalledTimes(1);
    provider.close();
  });

  it("rejects an active turn immediately when its client closes", async () => {
    const proc = spawn(process.execPath, ["-e", `
      require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
        const m = JSON.parse(line);
        if (m.id) process.stdout.write(JSON.stringify({id:m.id,result:{}})+'\\n');
      });
    `], { stdio: ["pipe", "pipe", "pipe"] });
    const client = attachCodexAppServerProcess(proc, 10000);
    const pending = client.runTurn("thread", "public fixture");
    const assertion = expect(pending).rejects.toThrow("closed");
    client.close();
    await assertion;
  });

  it.each([false, true])("keeps the original timeout without tools even if turn/start acknowledgement is missing: %s", async (acknowledge) => {
    const client = createToolProtocolClient(0, { acknowledge });
    await client.initialize();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      const result = client.runTurn("thread", "fixture", [], { toolWaitMs: 2000 });
      const assertion = expect(result).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally { client.close(); vi.useRealTimers(); }
  });

  it("fails only the turn whose turn/start returns a JSON-RPC error and clears its timers", async () => {
    const fixture = String.raw`
      const lines = require('node:readline').createInterface({ input: process.stdin });
      const emit = message => process.stdout.write(JSON.stringify(message) + '\n');
      let turns = 0;
      lines.on('line', line => {
        const message = JSON.parse(line);
        if (message.method === 'turn/start' && ++turns === 1) {
          emit({ id: message.id, error: { code: -32600, message: 'Fixture turn rejected' } });
        } else if (message.id) {
          emit({ id: message.id, result: {} });
          if (message.method === 'turn/start') {
            emit({ method: 'item/agentMessage/delta', params: { delta: 'Recovered turn' } });
            emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
          }
        }
      });
    `;
    const client = attachCodexAppServerProcess(
      spawn(process.execPath, ["-e", fixture], { stdio: ["pipe", "pipe", "pipe"] }),
      1000,
    );
    await client.initialize();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      await expect(client.runTurn("thread", "Rejected fixture", [], { toolWaitMs: 2000 }))
        .rejects.toThrow("Fixture turn rejected");
      expect(vi.getTimerCount()).toBe(0);
      expect(client.isClosed()).toBe(false);
      await expect(client.runTurn("thread", "Recovery fixture")).resolves.toBe("Recovered turn");
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(3000);
      expect(client.isClosed()).toBe(false);
    } finally { client.close(); vi.useRealTimers(); }
  });

  it("ignores a late turn/start error from a completed turn while another turn is active", async () => {
    const fixture = String.raw`
      const lines = require('node:readline').createInterface({ input: process.stdin });
      const emit = message => process.stdout.write(JSON.stringify(message) + '\n');
      const complete = text => {
        emit({ method: 'item/agentMessage/delta', params: { delta: text } });
        emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
      };
      let firstTurnRequest;
      lines.on('line', line => {
        const message = JSON.parse(line);
        if (message.method === 'turn/start' && firstTurnRequest === undefined) {
          firstTurnRequest = message.id;
          complete('First turn');
        } else if (message.id) {
          emit({ id: message.id, result: {} });
          if (message.method === 'turn/start') {
            emit({ id: firstTurnRequest, error: { code: -32600, message: 'Late stale rejection' } });
          } else if (message.method === 'finish') complete('Second turn');
        }
      });
    `;
    const client = attachCodexAppServerProcess(
      spawn(process.execPath, ["-e", fixture], { stdio: ["pipe", "pipe", "pipe"] }),
      1000,
    );
    await client.initialize();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      await expect(client.runTurn("thread", "First fixture")).resolves.toBe("First turn");
      const second = client.runTurn("thread", "Second fixture").catch((error: unknown) => error);
      await client.request("barrier", {});
      await vi.advanceTimersByTimeAsync(0);
      await client.request("finish", {});
      expect(await second).toBe("Second turn");
      expect(vi.getTimerCount()).toBe(0);
      expect(client.isClosed()).toBe(false);
    } finally { client.close(); vi.useRealTimers(); }
  });

  it("allows two sequential research waits longer than the main timeout", async () => {
    const client = createToolProtocolClient(2);
    await client.initialize();
    const waits = [deferred<void>(), deferred<void>()];
    const starts = [deferred<void>(), deferred<void>()];
    let calls = 0;
    const tool = clockTestTool(async () => {
      const index = calls++;
      starts[index]!.resolve();
      await waits[index]!.promise;
      return { status: "unavailable" };
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      const result = client.runTurn("thread", "fixture", [tool], { toolWaitMs: 2000 });
      for (let index = 0; index < 2; index++) {
        await starts[index]!.promise;
        await vi.advanceTimersByTimeAsync(900);
        waits[index]!.resolve();
      }
      await expect(result).resolves.toBe("Finished");
      expect(calls).toBe(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally { client.close(); vi.useRealTimers(); }
  });

  it("preserves only the unused generation time after research", async () => {
    const client = createToolProtocolClient(1, { complete: false, autoStart: false });
    await client.initialize();
    const started = deferred<void>();
    const wait = deferred<void>();
    const tool = clockTestTool(async () => { started.resolve(); await wait.promise; return {}; });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      const result = client.runTurn("thread", "fixture", [tool], { toolWaitMs: 2000 });
      const assertion = expect(result).rejects.toThrow("timed out");
      const settled = vi.fn();
      void result.then(settled, settled);
      await client.request("barrier", {});
      await vi.advanceTimersByTimeAsync(600);
      await client.request("begin", {});
      await started.promise;
      await vi.advanceTimersByTimeAsync(1500);
      wait.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(399);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(settled).toHaveBeenCalledOnce();
    } finally { client.close(); vi.useRealTimers(); }
  });

  it("stays paused until overlapping research calls both return", async () => {
    const client = createToolProtocolClient(2, { concurrent: true });
    await client.initialize();
    const waits = [deferred<void>(), deferred<void>()];
    const started = deferred<void>();
    let calls = 0;
    const tool = clockTestTool(async () => {
      const index = calls++;
      if (calls === 2) started.resolve();
      await waits[index]!.promise;
      return {};
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      const result = client.runTurn("thread", "fixture", [tool], { toolWaitMs: 2000 });
      await started.promise;
      await vi.advanceTimersByTimeAsync(1200);
      waits[0]!.resolve();
      await vi.advanceTimersByTimeAsync(1100);
      waits[1]!.resolve();
      await expect(result).resolves.toBe("Finished");
      expect(vi.getTimerCount()).toBe(0);
    } finally { client.close(); vi.useRealTimers(); }
  });

  it.each(["timeout", "close"])("settles %s during research and ignores the late tool response", async (reason) => {
    const client = createToolProtocolClient(1);
    await client.initialize();
    const started = deferred<void>();
    const wait = deferred<void>();
    const tool = clockTestTool(async () => { started.resolve(); await wait.promise; return {}; });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    try {
      const result = client.runTurn("thread", "fixture", [tool], { toolWaitMs: 2000 });
      const assertion = expect(result).rejects.toThrow(reason === "close" ? "closed" : "timed out");
      await started.promise;
      if (reason === "close") client.close();
      else await vi.advanceTimersByTimeAsync(3000);
      await assertion;
      wait.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { client.close(); vi.useRealTimers(); }
  });

  it("drains large app-server stderr output without retaining diagnostics", async () => {
    const fixture = String.raw`
      const fs = require("node:fs");
      const readline = require("node:readline");
      const chunk = Buffer.alloc(64 * 1024, 120);
      for (let index = 0; index < 64; index += 1) fs.writeSync(2, chunk);
      const lines = readline.createInterface({ input: process.stdin });
      lines.on("line", (line) => {
        const message = JSON.parse(line);
        if (typeof message.id === "number") {
          process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\n");
        }
      });
    `;
    const proc = spawn(process.execPath, ["-e", fixture], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = attachCodexAppServerProcess(proc, 2_000);

    await client.initialize();

    expect(client.isClosed()).toBe(false);
    client.close();
  }, 5_000);
});

class FakeCodexClient implements CodexAppServerClient {
  initializeCalls = 0;
  threadStartCalls = 0;
  turnThreadIds: string[] = [];
  prompts: string[] = [];
  threadStartParams: Array<Record<string, unknown>> = [];
  closed = false;
  failNextTurn = false;

  async initialize(): Promise<void> {
    this.initializeCalls += 1;
  }

  async request<T>(method: string, params: unknown): Promise<T> {
    if (method === "thread/start") {
      this.threadStartCalls += 1;
      this.threadStartParams.push(params as Record<string, unknown>);
      return { thread: { id: `thread-${this.threadStartCalls}` } } as T;
    }
    return {} as T;
  }

  async runTurn(threadId: string, prompt: string, _tools: AiTool[] = [], _options?: CodexTurnOptions): Promise<string> {
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

function clockTestTool(execute: AiTool["execute"]): AiTool {
  return {
    definition: { type: "function", name: "check_player_news", description: "Fixture", inputSchema: { type: "object" } },
    execute,
  };
}

function createToolProtocolClient(count: number, { concurrent = false, acknowledge = true, complete = true, autoStart = true } = {}) {
  const fixture = String.raw`
    const lines = require('node:readline').createInterface({ input: process.stdin });
    let calls = 0, replies = 0;
    const emit = message => process.stdout.write(JSON.stringify(message) + '\n');
    const call = () => emit({ id: 'tool-' + ++calls, method: 'item/tool/call', params: { tool: 'check_player_news', arguments: {} } });
    lines.on('line', line => {
      const message = JSON.parse(line);
      if (message.method === 'turn/start') {
        if (${acknowledge}) emit({ id: message.id, result: {} });
        if (${count} > 0 && ${autoStart}) {
          call();
          if (${concurrent}) while (calls < ${count}) call();
        }
      } else if (message.method && message.id) {
        if (message.method === 'begin') call();
        emit({ id: message.id, result: {} });
      } else if (String(message.id).startsWith('tool-')) {
        replies++;
        if (replies === ${count} && ${complete}) {
          emit({ method: 'item/agentMessage/delta', params: { delta: 'Finished' } });
          emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
        } else if (calls < ${count} && !${concurrent}) call();
      }
    });
  `;
  return attachCodexAppServerProcess(spawn(process.execPath, ["-e", fixture], { stdio: ["pipe", "pipe", "pipe"] }), 1000);
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("request scheduling", () => {
  it("runs questions before queued refreshes, coalesces by scope, and reuses the thread", async () => {
    const client = new FakeCodexClient();
    const started = deferred<void>();
    const release = deferred<void>();
    const order: string[] = [];
    client.runTurn = async (_id, prompt) => {
      const label = prompt.includes('"task": "draft_strategy"') ? "strategy" : "question";
      order.push(label);
      if (order.length === 1) { started.resolve(); await release.promise; }
      return "Grounded answer.";
    };
    const provider = new CodexAppServerProvider({ webSearch: false, clientFactory: async () => client });
    const context = buildDraftQuestionContext(createMockDraftState(0), "Fixture");
    const strategy = { ...context, task: "draft_strategy" as const, objective: "Fixture" };
    const first = provider.answerDraftQuestion(context);
    await started.promise;
    const replaced = provider.strategizeDraft(strategy, [], { automatic: true }).catch((error: unknown) => error);
    const latest = provider.strategizeDraft(strategy, [], { automatic: true }).catch(() => undefined);
    const question = provider.answerDraftQuestion(context);
    release.resolve();
    await Promise.all([first, latest, question]);
    expect(await replaced).toBeInstanceOf(Error);
    expect(order).toEqual(["question", "question", "strategy"]);
    expect(client.threadStartCalls).toBe(1);
    expect(provider.timingDiagnostics().map((entry) => entry.kind)).toEqual(["draft_question", "draft_question", "draft_strategy"]);
    provider.close();
  });

  it("reports news progress and separates tool time from model time", async () => {
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    const client = new FakeCodexClient();
    client.runTurn = async (_id, _prompt, tools = []) => {
      clock = 20;
      await tools[0]?.execute({});
      clock = 70;
      return "Grounded answer.";
    };
    const provider = new CodexAppServerProvider({ webSearch: false, clientFactory: async () => client });
    const phases: string[] = [];
    try {
      await provider.answerDraftQuestion(buildDraftQuestionContext(createMockDraftState(0), "Private question"), [clockTestTool(async () => { clock = 50; return {}; })], { onPhase: (phase) => phases.push(phase) });
      expect(phases).toEqual(["queued", "thinking", "news", "thinking"]);
      expect(provider.timingDiagnostics()).toEqual([{ kind: "draft_question", queueMs: 0, modelMs: 40, toolMs: 30, newsMs: 30 }]);
    } finally { provider.close(); now.mockRestore(); }
  });

  it("prioritizes an explicit refresh and retains only detached metadata for twenty turns", async () => {
    const client = new FakeCodexClient();
    const provider = new CodexAppServerProvider({ webSearch: false, clientFactory: async () => client });
    const context = buildDraftQuestionContext(createMockDraftState(0), "Private fixture");
    const started = deferred<void>();
    const release = deferred<void>();
    const order: string[] = [];
    client.runTurn = async (_id, prompt) => {
      order.push(prompt.includes('"task": "draft_strategy"') ? "strategy" : "question");
      if (order.length === 1) { started.resolve(); await release.promise; }
      return "Grounded answer.";
    };
    const first = provider.answerDraftQuestion(context);
    await started.promise;
    const background = provider.strategizeDraft({ ...context, draft: { ...context.draft, id: "other-scope" }, task: "draft_strategy", objective: "Fixture" }, [], { automatic: true }).catch(() => undefined);
    const manual = provider.strategizeDraft({ ...context, task: "draft_strategy", objective: "Fixture" }, [], { automatic: false }).catch(() => undefined);
    const question = provider.answerDraftQuestion(context);
    release.resolve();
    await Promise.all([first, background, manual, question]);
    expect(order).toEqual(["question", "strategy", "question", "strategy"]);
    for (let i = 0; i < 21; i++) await provider.answerDraftQuestion(context);
    const timings = provider.timingDiagnostics();
    expect(timings).toHaveLength(20);
    expect(Object.keys(timings[0] ?? {}).sort()).toEqual(["kind", "modelMs", "newsMs", "queueMs", "toolMs"]);
    timings[0]!.queueMs = -1;
    expect(provider.timingDiagnostics()[0]?.queueMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(timings)).not.toMatch(/Private|fixture|other-scope/);
    provider.close();
  });

  it.each(["stale", "close", "failure"])("settles queued work after %s without stranding the queue", async (reason) => {
    const client = new FakeCodexClient();
    const started = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    client.runTurn = async () => {
      if (++calls === 1) { started.resolve(); await release.promise; }
      if (reason === "failure" && calls === 1) throw new Error("Private upstream failure");
      return "Grounded answer.";
    };
    const provider = new CodexAppServerProvider({ webSearch: false, clientFactory: async () => client });
    const context = buildDraftQuestionContext(createMockDraftState(0), "Fixture");
    const first = provider.answerDraftQuestion(context).catch(() => undefined);
    await started.promise;
    let current = true;
    const queued = provider.answerDraftQuestion(context, [], { isCurrent: () => current }).catch((error: unknown) => error);
    if (reason === "stale") current = false;
    if (reason === "close") provider.close();
    release.resolve();
    await first;
    if (reason !== "failure") { expect(await queued).toBeInstanceOf(Error); expect(calls).toBe(1); }
    else { expect(await queued).toMatchObject({ answer: "Grounded answer." }); expect(calls).toBe(2); }
    provider.close();
  });
});

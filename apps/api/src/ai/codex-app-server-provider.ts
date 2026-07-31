import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { AiDraftDecisionSchema, type AiDraftDecision } from "@sleeper-draft-assistant/shared";

import type { AiAnswer, AiDraftStrategy, AiProvider, AiProviderStatus, AiTool, AiToolDefinition, DraftQuestionContext, DraftStrategyContext, TeamAiContext } from "./types";
import { buildDraftManagerPrompt, buildDraftStrategyPrompt, buildTeamManagerPrompt } from "./prompt";

type JsonRpcMessage = {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
};

type PendingRequest = {
  resolve: (message: JsonRpcMessage) => void;
  reject: (error: Error) => void;
};

export type CodexAppServerProviderOptions = {
  codexBin?: string;
  model?: string;
  timeoutMs?: number;
  clientFactory?: CodexClientFactory;
};

export type CodexAppServerClient = {
  initialize(experimentalApi?: boolean): Promise<void>;
  request<T = unknown>(method: string, params: unknown): Promise<T>;
  runTurn(threadId: string, prompt: string, tools?: AiTool[]): Promise<string>;
  isClosed(): boolean;
  close(): void;
};

export type CodexClientFactory = (
  codexBin: string,
  timeoutMs: number,
) => Promise<CodexAppServerClient>;

export class CodexAppServerProvider implements AiProvider {
  private readonly codexBin: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly clientFactory: CodexClientFactory;
  private client: CodexAppServerClient | null = null;
  private clientPromise: Promise<CodexAppServerClient> | null = null;
  private readonly threadIds = new Map<string, string>();
  private operationQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(options: CodexAppServerProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? "codex";
    this.model = options.model ?? process.env.SLEEPER_AI_CODEX_MODEL ?? "gpt-5.4";
    this.timeoutMs = options.timeoutMs ?? Number(process.env.SLEEPER_AI_CODEX_TIMEOUT_MS ?? 60000);
    this.clientFactory = options.clientFactory ?? CodexJsonRpcClient.start;
  }

  status(): AiProviderStatus {
    return {
      id: "codex-app-server",
      label: "Codex app-server",
      configured: true,
      experimental: true,
      detail: `Runs ${this.codexBin} app-server with model ${this.model}. Requires local Codex login/session.`,
    };
  }

  async strategizeDraft(context: DraftStrategyContext, tools: AiTool[] = []): Promise<AiDraftStrategy> {
    const result = await this.runPrompt(
      draftThreadScope(context),
      () => buildDraftStrategyPrompt(context),
      tools,
    );
    return {
      provider: this.status(),
      decision: parseAiDraftDecision(result),
    };
  }

  async answerDraftQuestion(context: DraftQuestionContext, tools: AiTool[] = []): Promise<AiAnswer> {
    const result = await this.runPrompt(
      draftThreadScope(context),
      (reusedThread) => buildDraftManagerPrompt(
        reusedThread ? { ...context, conversationHistory: [] } : context,
      ),
      tools,
    );
    return {
      provider: this.status(),
      answer: result || "Codex completed without returning visible text.",
    };
  }

  async answerTeamQuestion(context: TeamAiContext): Promise<AiAnswer> {
    const result = await this.runPrompt(
      teamThreadScope(context),
      (reusedThread) => buildTeamManagerPrompt(
        reusedThread ? { ...context, conversationHistory: [] } : context,
      ),
    );
    return {
      provider: this.status(),
      answer: result || "Codex completed without returning visible text.",
    };
  }

  close(): void {
    this.closed = true;
    this.client?.close();
    if (!this.client) {
      void this.clientPromise?.then((client) => client.close()).catch(() => undefined);
    }
    this.client = null;
    this.clientPromise = null;
    this.threadIds.clear();
  }

  private runPrompt(
    scope: string,
    buildPrompt: (reusedThread: boolean) => string,
    tools: AiTool[] = [],
  ): Promise<string> {
    return this.enqueue(async () => {
      if (this.closed) {
        throw new Error("Codex app-server provider is closed.");
      }

      const client = await this.getClient();
      let threadId = this.threadIds.get(scope) ?? null;
      const reusedThread = Boolean(threadId);
      try {
        if (!threadId) {
          const thread = await client.request<{ thread?: { id?: string } }>("thread/start", {
            model: this.model,
            ephemeral: true,
            approvalPolicy: "never",
            sandbox: "read-only",
            serviceName: "sleeper_draft_assistant",
            baseInstructions:
              "You are the reasoning provider for a local, read-only Sleeper fantasy football assistant. Use only facts supplied in the current and prior user turns and their fantasy tools. The newest structured draft or team snapshot is authoritative when prior context conflicts. Do not inspect files, run shell commands, browse the web, modify anything, or invent unavailable facts.",
            ...(tools.length > 0 ? { dynamicTools: toDynamicToolDefinitions(tools) } : {}),
          });
          threadId = thread.thread?.id ?? null;
          if (!threadId) {
            throw new Error("Codex app-server did not return a thread id.");
          }
          this.threadIds.set(scope, threadId);
        }

        return await client.runTurn(threadId, buildPrompt(reusedThread), tools);
      } catch (error) {
        client.close();
        this.client = null;
        this.clientPromise = null;
        this.threadIds.clear();
        throw error;
      }
    });
  }

  private async getClient(): Promise<CodexAppServerClient> {
    if (this.client && !this.client.isClosed()) {
      return this.client;
    }

    this.threadIds.clear();
    this.clientPromise = this.clientFactory(this.codexBin, this.timeoutMs);
    try {
      const client = await this.clientPromise;
      await client.initialize(true);
      this.client = client;
      return client;
    } catch (error) {
      void this.clientPromise.then((client) => client.close()).catch(() => undefined);
      this.clientPromise = null;
      throw error;
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function draftThreadScope(context: DraftStrategyContext | DraftQuestionContext): string {
  return `draft:${context.draft.id}:${context.roster.teamId}`;
}

function teamThreadScope(context: TeamAiContext): string {
  return `team:${context.teamState.league.id}:${context.teamState.userTeam.rosterId}:${context.teamState.league.season ?? "unknown"}`;
}

export function parseAiDraftDecision(raw: string): AiDraftDecision {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Codex did not return a structured draft decision.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new Error("Codex returned malformed draft decision JSON.");
  }
  const result = AiDraftDecisionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Codex returned an invalid draft decision.");
  }
  return result.data;
}

class CodexJsonRpcClient {
  private nextId = 1;
  private initialized = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly deltas: string[] = [];
  private tools = new Map<string, AiTool>();
  private turnComplete: ((value: string) => void) | null = null;
  private turnFailed: ((error: Error) => void) | null = null;
  private toolCallCount = 0;
  private closed = false;

  private constructor(
    private readonly proc: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
  ) {}

  static async start(codexBin: string, timeoutMs: number): Promise<CodexJsonRpcClient> {
    const launch = resolveCodexLaunch(codexBin);
    const proc = spawn(launch.command, [...launch.args, "app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const client = new CodexJsonRpcClient(proc, timeoutMs);
    client.attach();
    return client;
  }

  async initialize(experimentalApi = false) {
    if (this.initialized) {
      return;
    }

    await this.request("initialize", {
      clientInfo: {
        name: "sleeper_draft_assistant",
        title: "Sleeper Draft Assistant",
        version: "0.1.0-alpha.5",
      },
      ...(experimentalApi ? { capabilities: { experimentalApi: true } } : {}),
    });
    this.notify("initialized", {});
    this.initialized = true;
  }

  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++;
    const response = await this.sendRequest(id, method, params);
    if (response.error) {
      throw new Error(response.error.message ?? `Codex app-server request ${method} failed.`);
    }
    return response.result as T;
  }

  async runTurn(threadId: string, prompt: string, tools: AiTool[] = []): Promise<string> {
    this.deltas.length = 0;
    this.toolCallCount = 0;
    this.tools = new Map(tools.map((tool) => [tool.definition.name, tool]));
    const completion = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.turnComplete = null;
        this.turnFailed = null;
        reject(new Error(`Codex app-server timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      this.turnComplete = (text) => {
        clearTimeout(timeout);
        this.turnComplete = null;
        this.turnFailed = null;
        resolve(text);
      };
      this.turnFailed = (error) => {
        clearTimeout(timeout);
        this.turnComplete = null;
        this.turnFailed = null;
        reject(error);
      };
    });
    try {
      await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: prompt }],
      });
    } catch (error) {
      this.turnFailed?.(error instanceof Error ? error : new Error(String(error)));
    }
    return await completion;
  }

  notify(method: string, params: unknown) {
    this.write({ method, params });
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex app-server closed."));
    }
    this.pending.clear();
    this.proc.kill();
  }

  isClosed(): boolean {
    return this.closed;
  }

  private sendRequest(id: number, method: string, params: unknown): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request ${method} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.write({ id, method, params });
    });
  }

  private write(message: unknown) {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private attach() {
    const lines = readline.createInterface({ input: this.proc.stdout });
    lines.on("line", (line) => void this.handleLine(line));

    this.proc.once("error", (error) => this.rejectAll(error instanceof Error ? error : new Error(String(error))));
    this.proc.once("exit", (code, signal) => {
      this.closed = true;
      this.rejectAll(new Error(`Codex app-server exited (${signal ?? code ?? "unknown"}).`));
    });
  }

  private async handleLine(line: string) {
    if (!line.trim()) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }

    if ((typeof message.id === "number" || typeof message.id === "string") && message.method === "item/tool/call") {
      await this.handleDynamicToolCall(message.id, message.params);
      return;
    }

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        pending.resolve(message);
      }
      return;
    }

    if (message.method === "item/agentMessage/delta") {
      const delta = getNestedString(message.params, ["delta"]) ?? getNestedString(message.params, ["text"]);
      if (delta) {
        this.deltas.push(delta);
      }
      return;
    }

    if (message.method === "turn/completed") {
      const status = getNestedString(message.params, ["turn", "status"]);
      if (status === "failed") {
        this.turnFailed?.(new Error(
          getNestedString(message.params, ["turn", "error", "message"]) ?? "Codex turn failed.",
        ));
        return;
      }
      this.turnComplete?.(this.deltas.join("").trim());
      return;
    }

    if (message.method === "turn/failed") {
      this.turnFailed?.(new Error(getNestedString(message.params, ["error", "message"]) ?? "Codex turn failed."));
    }
  }

  private async handleDynamicToolCall(id: number | string, params: unknown) {
    this.toolCallCount += 1;
    if (this.toolCallCount > 6) {
      this.write({
        id,
        result: dynamicToolError("Draft tool-call limit reached. Finish the recommendation using existing evidence."),
      });
      return;
    }

    this.write({
      id,
      result: await executeDynamicToolCall(
        this.tools,
        getNestedString(params, ["tool"]),
        getNestedValue(params, ["arguments"]),
      ),
    });
  }

  private rejectAll(error: Error) {
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.turnFailed?.(error);
  }
}

export function toDynamicToolDefinitions(tools: AiTool[]): AiToolDefinition[] {
  return tools.map((tool) => tool.definition);
}

export async function executeDynamicToolCall(
  tools: Map<string, AiTool>,
  toolName: string | null,
  argumentsValue: unknown,
) {
  const tool = toolName ? tools.get(toolName) : null;
  if (!tool) {
    return dynamicToolError("Unknown or unavailable draft tool.");
  }
  try {
    const result = await tool.execute(argumentsValue);
    return {
      success: true,
      contentItems: [{ type: "inputText" as const, text: JSON.stringify(result) }],
    };
  } catch {
    return dynamicToolError("The draft tool rejected those arguments.");
  }
}

function dynamicToolError(message: string) {
  return {
    success: false,
    contentItems: [{ type: "inputText", text: JSON.stringify({ error: message }) }],
  };
}

export type CodexLaunch = {
  command: string;
  args: string[];
};

export function resolveCodexLaunch(
  codexBin: string,
  platform = process.platform,
  findWindowsLaunch: () => CodexLaunch = findCodexLaunchOnWindows,
): CodexLaunch {
  if (platform !== "win32" || path.extname(codexBin).toLowerCase() === ".exe") {
    return { command: codexBin, args: [] };
  }

  const normalized = codexBin.trim().toLowerCase();
  if (normalized === "codex" || normalized === "codex.cmd") {
    return findWindowsLaunch();
  }

  if (normalized.endsWith(".cmd")) {
    return resolveNpmCodexLauncher(codexBin);
  }

  return { command: codexBin, args: [] };
}

function findCodexLaunchOnWindows(): CodexLaunch {
  const cmdLauncher = findFirstWindowsCommand("codex.cmd");
  if (cmdLauncher) {
    return resolveNpmCodexLauncher(cmdLauncher);
  }

  const executable = findFirstWindowsCommand("codex.exe");
  if (executable) {
    return { command: executable, args: [] };
  }
  throw new Error("Windows could not locate the Codex CLI. Configure its full path in Settings.");
}

function resolveNpmCodexLauncher(cmdLauncher: string): CodexLaunch {
  const codexScript = path.join(path.dirname(cmdLauncher), "node_modules", "@openai", "codex", "bin", "codex.js");
  if (!existsSync(codexScript)) {
    throw new Error("The configured codex.cmd is not an npm Codex launcher. Configure codex.exe instead.");
  }
  const nodeExecutable = findFirstWindowsCommand("node.exe");
  if (!nodeExecutable) {
    throw new Error("Windows could not locate node.exe required by the npm Codex launcher.");
  }
  return {
    command: nodeExecutable,
    args: [codexScript],
  };
}

function findFirstWindowsCommand(command: string): string | null {
  try {
    const output = execFileSync("where.exe", [command], {
      encoding: "utf8",
      windowsHide: true,
    });
    return output
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function getNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}




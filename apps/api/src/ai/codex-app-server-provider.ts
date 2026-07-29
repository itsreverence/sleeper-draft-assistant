import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

import type { AiAnswer, AiProvider, AiProviderStatus, DraftAiContext, TeamAiContext } from "./types";
import { buildDraftManagerPrompt, buildTeamManagerPrompt } from "./prompt";

type JsonRpcMessage = {
  id?: number;
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
};

export class CodexAppServerProvider implements AiProvider {
  private readonly codexBin: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: CodexAppServerProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? "codex";
    this.model = options.model ?? process.env.SLEEPER_AI_CODEX_MODEL ?? "gpt-5.4";
    this.timeoutMs = options.timeoutMs ?? Number(process.env.SLEEPER_AI_CODEX_TIMEOUT_MS ?? 60000);
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

  async answerDraftQuestion(context: DraftAiContext): Promise<AiAnswer> {
    const client = await CodexJsonRpcClient.start(this.codexBin, this.timeoutMs);
    try {
      await client.initialize();
      const thread = await client.request<{ thread?: { id?: string } }>("thread/start", {
        model: this.model,
      });
      const threadId = thread.thread?.id;
      if (!threadId) {
        throw new Error("Codex app-server did not return a thread id.");
      }

      const result = await client.runTurn(threadId, buildDraftManagerPrompt(context));
      return {
        provider: this.status(),
        answer: result || "Codex completed without returning visible text.",
      };
    } finally {
      client.close();
    }
  }

  async answerTeamQuestion(context: TeamAiContext): Promise<AiAnswer> {
    const client = await CodexJsonRpcClient.start(this.codexBin, this.timeoutMs);
    try {
      await client.initialize();
      const thread = await client.request<{ thread?: { id?: string } }>("thread/start", {
        model: this.model,
      });
      const threadId = thread.thread?.id;
      if (!threadId) {
        throw new Error("Codex app-server did not return a thread id.");
      }

      const result = await client.runTurn(threadId, buildTeamManagerPrompt(context));
      return {
        provider: this.status(),
        answer: result || "Codex completed without returning visible text.",
      };
    } finally {
      client.close();
    }
  }}

class CodexJsonRpcClient {
  private nextId = 1;
  private initialized = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly deltas: string[] = [];
  private turnComplete: ((value: string) => void) | null = null;
  private turnFailed: ((error: Error) => void) | null = null;

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

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.request("initialize", {
      clientInfo: {
        name: "sleeper_draft_assistant",
        title: "Sleeper Draft Assistant",
        version: "0.1.0-alpha.1",
      },
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

  async runTurn(threadId: string, prompt: string): Promise<string> {
    this.deltas.length = 0;
    await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
    });

    return await new Promise<string>((resolve, reject) => {
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
  }

  notify(method: string, params: unknown) {
    this.write({ method, params });
  }

  close() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex app-server closed."));
    }
    this.pending.clear();
    this.proc.kill();
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
    lines.on("line", (line) => this.handleLine(line));

    this.proc.once("error", (error) => this.rejectAll(error instanceof Error ? error : new Error(String(error))));
    this.proc.once("exit", (code, signal) => {
      this.rejectAll(new Error(`Codex app-server exited (${signal ?? code ?? "unknown"}).`));
    });
  }

  private handleLine(line: string) {
    if (!line.trim()) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
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
      this.turnComplete?.(this.deltas.join("").trim());
      return;
    }

    if (message.method === "turn/failed") {
      this.turnFailed?.(new Error(getNestedString(message.params, ["error", "message"]) ?? "Codex turn failed."));
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.turnFailed?.(error);
  }
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




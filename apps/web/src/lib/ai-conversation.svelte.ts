import { onDestroy } from "svelte";
import type { AiRequestPhase, AiRequestProgress } from "./api";
import type { AiConversationMessage, DraftStrategyProposal } from "./types";

export type AiConversationReply = {
  answer: string;
  strategyProposal?: DraftStrategyProposal | null;
};

export type AiConversationDisplayMessage = {
  id: string;
  role: AiConversationMessage["role"];
  content: string;
  status: "loading" | "error" | "complete" | "cancelled";
  phase?: AiRequestPhase;
  strategyProposal?: DraftStrategyProposal | null;
  strategyProposalApplied?: boolean;
};

export const CANCEL_REQUEST_HELP = "Stop waiting for this answer. If the Assistant had already started, it finishes in the background and its answer isn’t shown.";
const CANCELLED_MESSAGE = "Cancelled. If the Assistant had already started, it finishes in the background and its answer isn’t shown.";

export function createAiConversation(options: {
  ask: (question: string, history: AiConversationMessage[], progress: AiRequestProgress) => Promise<AiConversationReply>;
  fallbackError: string;
}) {
  let question = $state("");
  let messages: AiConversationDisplayMessage[] = $state([]);
  let isAsking = $state(false);
  let copied = $state(false);
  let controller: AbortController | undefined;
  let identity = "";
  let requestSequence = 0;
  let activeRequestId = 0;

  function createMessage(
    role: AiConversationDisplayMessage["role"],
    content: string,
    status: AiConversationDisplayMessage["status"] = "complete",
  ): AiConversationDisplayMessage {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      status,
    };
  }

  function invalidateRequests() {
    controller?.abort();
    requestSequence += 1;
    activeRequestId = 0;
    isAsking = false;
  }

  onDestroy(invalidateRequests);

  function clear(invalidatePending = true) {
    if (invalidatePending) invalidateRequests();
    messages = [];
    question = "";
  }

  function syncIdentity(nextIdentity: string) {
    if (identity && identity !== nextIdentity) clear(true);
    identity = nextIdentity;
  }

  function history(): AiConversationMessage[] {
    return messages.flatMap((message, index): AiConversationMessage[] => {
      const answer = messages[index + 1];
      if (message.role !== "user" || answer?.role !== "assistant" || answer.status !== "complete") return [];
      return [
        { role: "user", content: message.content.trim() },
        { role: "assistant", content: answer.content.trim() },
      ];
    }).slice(-8);
  }

  async function submit(overrideQuestion?: string): Promise<boolean> {
    const trimmed = (overrideQuestion ?? question).trim();
    if (!trimmed || isAsking) return false;

    const requestIdentity = identity;
    const requestId = ++requestSequence;
    activeRequestId = requestId;
    isAsking = true;
    question = "";
    const conversationHistory = history();
    const loading: AiConversationDisplayMessage = { ...createMessage("assistant", "", "loading"), phase: "thinking" };
    messages = [...messages, createMessage("user", trimmed), loading];

    controller = new AbortController();
    try {
      const result = await options.ask(trimmed, conversationHistory, {
        signal: controller.signal,
        onPhase: (phase) => {
          if (requestId !== activeRequestId || requestIdentity !== identity) return;
          messages = messages.map((message) => message.id === loading.id ? { ...message, phase } : message);
        },
      });
      if (requestId !== activeRequestId || requestIdentity !== identity) return false;
      messages = messages.map((message) => message.id === loading.id
        ? {
            ...message,
            content: result.answer,
            status: "complete",
            phase: undefined,
            strategyProposal: result.strategyProposal ?? null,
          }
        : message);
      return true;
    } catch (error) {
      if (requestId !== activeRequestId || requestIdentity !== identity) return false;
      const content = error instanceof Error ? error.message : options.fallbackError;
      messages = messages.map((message) => message.id === loading.id
        ? { ...message, content, status: "error", phase: undefined }
        : message);
      return false;
    } finally {
      if (requestId === activeRequestId && requestIdentity === identity) isAsking = false;
    }
  }

  // The abort cancels queued server work and closes the request. A model turn
  // that already started cannot be interrupted, so its late result is dropped by
  // the request-id guard in submit.
  function cancel() {
    if (!isAsking) return;
    invalidateRequests();
    messages = messages.map((message) => message.status === "loading"
      ? { ...message, content: CANCELLED_MESSAGE, status: "cancelled", phase: undefined }
      : message);
  }

  function questionFor(messageId: string): string {
    const index = messages.findIndex((message) => message.id === messageId);
    return messages[index - 1]?.role === "user" ? messages[index - 1]!.content : "";
  }

  async function copy(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      window.setTimeout(() => (copied = false), 1400);
    } catch {
      copied = false;
    }
  }

  function markStrategyProposalApplied(messageId: string) {
    messages = messages.map((message) => message.id === messageId
      ? { ...message, strategyProposalApplied: true }
      : message);
  }

  return {
    get question() { return question; },
    set question(value: string) { question = value; },
    get messages() { return messages; },
    get isAsking() { return isAsking; },
    get copied() { return copied; },
    questionFor,
    syncIdentity,
    submit,
    cancel,
    clear,
    copy,
    markStrategyProposalApplied,
  };
}

export type AiConversation = ReturnType<typeof createAiConversation>;

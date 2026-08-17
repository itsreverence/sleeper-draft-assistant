import type { AiConversationMessage, DraftStrategyProposal } from "./types";

export type AiConversationReply = {
  answer: string;
  strategyProposal?: DraftStrategyProposal | null;
};

export type AiConversationDisplayMessage = {
  id: string;
  role: AiConversationMessage["role"];
  content: string;
  status: "loading" | "error" | "complete";
  strategyProposal?: DraftStrategyProposal | null;
  strategyProposalApplied?: boolean;
};

export function createAiConversation(options: {
  ask: (question: string, history: AiConversationMessage[]) => Promise<AiConversationReply>;
  loadingMessage: string;
  fallbackError: string;
}) {
  let question = $state("");
  let messages: AiConversationDisplayMessage[] = $state([]);
  let isAsking = $state(false);
  let copied = $state(false);
  let lastQuestion = $state("");
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
    requestSequence += 1;
    activeRequestId = 0;
    isAsking = false;
  }

  function clear(invalidatePending = true) {
    if (invalidatePending) invalidateRequests();
    messages = [];
    question = "";
    lastQuestion = "";
  }

  function syncIdentity(nextIdentity: string) {
    if (identity && identity !== nextIdentity) clear(true);
    identity = nextIdentity;
  }

  function history(): AiConversationMessage[] {
    return messages
      .filter((message) => message.status !== "loading" && message.content.trim())
      .map((message) => ({ role: message.role, content: message.content.trim() }))
      .slice(-8);
  }

  async function submit(overrideQuestion?: string): Promise<boolean> {
    const trimmed = (overrideQuestion ?? question).trim();
    if (!trimmed || isAsking) return false;

    const requestIdentity = identity;
    const requestId = ++requestSequence;
    activeRequestId = requestId;
    isAsking = true;
    lastQuestion = trimmed;
    question = "";
    const conversationHistory = history();
    const loading = createMessage("assistant", options.loadingMessage, "loading");
    messages = [...messages, createMessage("user", trimmed), loading];

    try {
      const result = await options.ask(trimmed, conversationHistory);
      if (requestId !== activeRequestId || requestIdentity !== identity) return false;
      messages = messages.map((message) => message.id === loading.id
        ? {
            ...message,
            content: result.answer,
            status: "complete",
            strategyProposal: result.strategyProposal ?? null,
          }
        : message);
      return true;
    } catch (error) {
      if (requestId !== activeRequestId || requestIdentity !== identity) return false;
      const content = error instanceof Error ? error.message : options.fallbackError;
      messages = messages.map((message) => message.id === loading.id
        ? { ...message, content, status: "error" }
        : message);
      return false;
    } finally {
      if (requestId === activeRequestId && requestIdentity === identity) isAsking = false;
    }
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
    get lastQuestion() { return lastQuestion; },
    syncIdentity,
    submit,
    clear,
    copy,
    markStrategyProposalApplied,
  };
}

export type AiConversation = ReturnType<typeof createAiConversation>;

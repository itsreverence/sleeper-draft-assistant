import type { Context } from "hono";

export type ConversationMessageInput = {
  role?: string;
  content?: string;
};

export function normalizeConversationHistory(history: ConversationMessageInput[] | undefined) {
  return (history ?? [])
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content!.trim() }))
    .filter((message) => message.content.length > 0)
    .slice(-8);
}

export function getUserRosterId(c: Context): string | null {
  return c.req.query("userRosterId") ?? null;
}

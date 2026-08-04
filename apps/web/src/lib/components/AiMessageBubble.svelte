<script lang="ts">
  import type { DraftStrategyProposal } from "../types";
  import ResponseMarkdown from "./ResponseMarkdown.svelte";

  export type AiMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    status?: "loading" | "error" | "complete";
    strategyProposal?: DraftStrategyProposal | null;
    strategyProposalApplied?: boolean;
  };

  let {
    message,
    onCopy,
    onRetry,
    onApplyStrategyProposal,
  }: {
    message: AiMessage;
    onCopy?: (content: string) => void;
    onRetry?: () => void;
    onApplyStrategyProposal?: (proposal: DraftStrategyProposal) => void;
  } = $props();
</script>

<div class="message-row role-{message.role}">
  <div class="message-bubble status-{message.status ?? "complete"}">
    {#if message.status === "loading"}
      <div class="loading-line">
        <span class="spinner"></span>
        <span>{message.content}</span>
      </div>
    {:else if message.role === "assistant"}
      <ResponseMarkdown content={message.content} />
    {:else}
      <p>{message.content}</p>
    {/if}

    {#if message.role === "assistant" && message.strategyProposal}
      <div class="strategy-proposal">
        <div>
          <strong>{message.strategyProposal.scope === "next-pick" ? "Next-pick guidance" : "Rest-of-draft guidance"}</strong>
          <span>{message.strategyProposal.text}</span>
        </div>
        <button
          type="button"
          disabled={message.strategyProposalApplied}
          onclick={() => onApplyStrategyProposal?.(message.strategyProposal!)}
        >
          {message.strategyProposalApplied ? "Applied" : "Apply to strategy"}
        </button>
      </div>
    {/if}

    {#if message.role === "assistant" && message.status !== "loading"}
      <div class="message-actions">
        <button class="tiny-action" type="button" onclick={() => onCopy?.(message.content)}>Copy</button>
        {#if message.status === "error"}
          <button class="tiny-action" type="button" onclick={() => onRetry?.()}>Retry</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .message-row {
    display: flex;
    min-width: 0;
  }

  .role-user {
    justify-content: flex-end;
  }

  .role-assistant {
    justify-content: flex-start;
  }

  .message-bubble {
    max-width: 92%;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    padding: 11px 12px;
    color: var(--text-secondary);
    min-width: 0;
  }

  .role-user .message-bubble {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  .status-error {
    border-color: var(--danger-border);
    background: var(--danger-soft);
  }

  .message-bubble p {
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .loading-line {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .message-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 9px;
  }

  .strategy-proposal {
    display: grid;
    gap: 9px;
    margin-top: 11px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .strategy-proposal > div {
    display: grid;
    gap: 3px;
  }

  .strategy-proposal strong {
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .strategy-proposal span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .strategy-proposal button {
    width: fit-content;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    padding: 6px 8px;
    color: var(--accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .strategy-proposal button:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .tiny-action {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
    padding: 0;
    text-transform: uppercase;
  }

  .tiny-action:hover {
    color: var(--text-primary);
  }
</style>

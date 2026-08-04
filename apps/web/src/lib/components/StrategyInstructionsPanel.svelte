<script lang="ts">
  import type { DraftStrategyInstruction, DraftStrategyInstructionScope, DraftStrategyProposal } from "../types";
  import Icon from "./Icon.svelte";

  let {
    instructions = [],
    busy = false,
    error = "",
    onCreate,
    onUpdate,
    onDelete,
  }: {
    instructions?: DraftStrategyInstruction[];
    busy?: boolean;
    error?: string;
    onCreate: (proposal: DraftStrategyProposal) => Promise<void>;
    onUpdate: (instructionId: string, proposal: DraftStrategyProposal) => Promise<void>;
    onDelete: (instructionId: string) => Promise<void>;
  } = $props();

  let text = $state("");
  let scope: DraftStrategyInstructionScope = $state("next-pick");
  let editingId: string | null = $state(null);
  let editorOpen = $state(false);

  function resetEditor() {
    text = "";
    scope = "next-pick";
    editingId = null;
    editorOpen = false;
  }

  function edit(instruction: DraftStrategyInstruction) {
    text = instruction.text;
    scope = instruction.scope;
    editingId = instruction.id;
    editorOpen = true;
  }

  async function save() {
    const proposal = { text: text.trim(), scope };
    if (!proposal.text || busy) return;
    try {
      if (editingId) await onUpdate(editingId, proposal);
      else await onCreate(proposal);
      resetEditor();
    } catch {
      // Keep the editor open so the user can retry after the parent surfaces the error.
    }
  }

  async function remove(instructionId: string) {
    if (busy) return;
    try {
      await onDelete(instructionId);
    } catch {
      // The parent keeps the item in place and surfaces the persistence error.
    }
  }
</script>

<section class="instructions-panel">
  <div class="instructions-heading">
    <div>
      <h3>User guidance</h3>
      <span>Preferences the AI should consider while building your roster.</span>
    </div>
    <button class="add-instruction" type="button" disabled={busy} onclick={() => (editorOpen = !editorOpen)} aria-expanded={editorOpen}>
      <Icon name={editorOpen ? "close" : "plus"} size={13} />
      {editorOpen ? "Cancel" : "Add guidance"}
    </button>
  </div>

  {#if instructions.length > 0}
    <ul class="instruction-list">
      {#each instructions as instruction (instruction.id)}
        <li>
          <div class="instruction-copy">
            <span class="scope-label">{instruction.scope === "next-pick" ? "Next pick" : "Rest of draft"}</span>
            <p>{instruction.text}</p>
            {#if instruction.source === "ai-chat"}<small>Added from AI chat</small>{/if}
          </div>
          <div class="instruction-actions">
            <button type="button" disabled={busy} onclick={() => edit(instruction)}>Edit</button>
            <button class="remove" type="button" disabled={busy} aria-label={`Remove ${instruction.text}`} onclick={() => remove(instruction.id)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {:else if !editorOpen}
    <p class="empty-guidance">No custom guidance. AI is currently reasoning from the board, roster, and player evidence only.</p>
  {/if}

  {#if editorOpen}
    <div class="instruction-editor">
      <div class="scope-control" role="group" aria-label="Strategy instruction scope">
        <button type="button" class:active={scope === "next-pick"} aria-pressed={scope === "next-pick"} onclick={() => (scope = "next-pick")}>Next pick</button>
        <button type="button" class:active={scope === "draft"} aria-pressed={scope === "draft"} onclick={() => (scope = "draft")}>Rest of draft</button>
      </div>
      <textarea
        bind:value={text}
        rows="3"
        maxlength="280"
        placeholder={scope === "next-pick" ? "e.g. Consider an elite TE at this pick." : "e.g. Favor Bears players when the value is close."}
        aria-label="Strategy guidance"
      ></textarea>
      <div class="editor-footer">
        <span>{text.length}/280</span>
        <button class="btn btn-primary" type="button" disabled={busy || !text.trim()} onclick={save}>
          {busy ? "Saving" : editingId ? "Save changes" : "Add guidance"}
        </button>
      </div>
    </div>
  {/if}

  {#if error}<p class="instruction-error" role="alert">{error}</p>{/if}
</section>

<style>
  .instructions-panel {
    display: grid;
    gap: 12px;
    border-top: 1px solid var(--border);
    padding-top: 14px;
  }

  .instructions-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .instructions-heading > div {
    display: grid;
    gap: 3px;
  }

  .instructions-heading h3 {
    font-size: var(--text-sm);
  }

  .instructions-heading span,
  .empty-guidance {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .add-instruction,
  .instruction-actions button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    background: transparent;
    padding: 3px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .add-instruction {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .add-instruction:disabled,
  .instruction-actions button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .add-instruction:hover,
  .instruction-actions button:hover {
    color: var(--text-primary);
  }

  .instruction-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .instruction-list li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 10px;
  }

  .instruction-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .instruction-copy p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .instruction-copy small {
    color: var(--text-muted);
    font-size: var(--text-2xs);
  }

  .scope-label {
    color: var(--accent);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .instruction-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
  }

  .instruction-actions .remove:hover {
    color: var(--danger);
  }

  .instruction-editor {
    display: grid;
    gap: 9px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    padding: 10px;
  }

  .scope-control {
    display: inline-flex;
    width: fit-content;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .scope-control button {
    border: 0;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    padding: 5px 8px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .scope-control button.active {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .instruction-editor textarea {
    width: 100%;
    resize: vertical;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    padding: 9px 10px;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .editor-footer > span,
  .instruction-error {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .instruction-error {
    color: var(--danger);
  }
</style>

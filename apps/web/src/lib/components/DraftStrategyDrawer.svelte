<script lang="ts">
  import type { AiDraftStrategyPayload, DecisionSnapshot, DraftStrategyInstruction, DraftStrategyProposal } from "../types";
  import DraftStrategyPanel from "./DraftStrategyPanel.svelte";
  import Icon from "./Icon.svelte";
  import StrategyInstructionsPanel from "./StrategyInstructionsPanel.svelte";

  let {
    strategy = null,
    history = [],
    isLoadingHistory = false,
    historyError = "",
    instructions = [],
    instructionsBusy = false,
    instructionsError = "",
    onCreateInstruction,
    onUpdateInstruction,
    onDeleteInstruction,
    onClose,
  }: {
    strategy?: AiDraftStrategyPayload | null;
    history?: DecisionSnapshot[];
    isLoadingHistory?: boolean;
    historyError?: string;
    instructions?: DraftStrategyInstruction[];
    instructionsBusy?: boolean;
    instructionsError?: string;
    onCreateInstruction: (proposal: DraftStrategyProposal) => Promise<void>;
    onUpdateInstruction: (instructionId: string, proposal: DraftStrategyProposal) => Promise<void>;
    onDeleteInstruction: (instructionId: string) => Promise<void>;
    onClose: () => void;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="drawer-backdrop" type="button" aria-label="Close draft plan" onclick={onClose}></button>
<div class="strategy-drawer" role="dialog" aria-modal="true" aria-label="Draft plan">
  <button class="drawer-close" type="button" aria-label="Close draft plan" onclick={onClose}>
    <Icon name="close" size={16} />
  </button>
  {#if strategy}
    <DraftStrategyPanel
      {strategy}
      {history}
      {isLoadingHistory}
      {historyError}
      embedded={true}
      detailsOpen={true}
    />
  {:else}
    <div class="drawer-heading">
      <h2><Icon name="clipboard" size={17} /> Draft strategy</h2>
      <p>Add guidance now. The next AI evaluation will use it with the current board and roster.</p>
    </div>
  {/if}
  <StrategyInstructionsPanel
    {instructions}
    busy={instructionsBusy}
    error={instructionsError}
    onCreate={onCreateInstruction}
    onUpdate={onUpdateInstruction}
    onDelete={onDeleteInstruction}
  />
</div>

<style>
  .drawer-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 0.52);
    cursor: default;
  }

  .strategy-drawer {
    position: fixed;
    z-index: 41;
    top: 0;
    right: 0;
    width: min(440px, 92vw);
    height: 100vh;
    overflow-y: auto;
    border-left: 1px solid var(--border-strong);
    background: var(--surface-raised);
    box-shadow: -18px 0 50px rgb(0 0 0 / 0.28);
    padding: 48px var(--space-4) var(--space-4);
  }

  .drawer-close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .drawer-close:hover {
    border-color: var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .drawer-heading {
    display: grid;
    gap: 7px;
    margin-bottom: 14px;
  }

  .drawer-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-lg);
  }

  .drawer-heading p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  @media (max-width: 560px) {
    .strategy-drawer {
      top: auto;
      bottom: 0;
      width: 100%;
      height: min(78vh, 680px);
      border-top: 1px solid var(--border-strong);
      border-left: 0;
      padding-top: 48px;
    }
  }
</style>

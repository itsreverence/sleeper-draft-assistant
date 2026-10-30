<script lang="ts">
  import type { AiDraftStrategyPayload, DecisionSnapshot, DraftStrategyInstruction, DraftStrategyProposal } from "../types";
  import Drawer from "./Drawer.svelte";
  import DraftStrategyPanel from "./DraftStrategyPanel.svelte";
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

</script>

<Drawer
  label="Draft plan"
  closeLabel="Close draft plan"
  title="Draft strategy"
  icon="clipboard"
  subtitle={strategy
    ? `Updated at pick ${strategy.decision.plan.updatedAtPick}`
    : "Add guidance now. The next Assistant evaluation will use it with the current board and roster."}
  {onClose}
>
  {#if strategy}
    <DraftStrategyPanel
      {strategy}
      {history}
      {isLoadingHistory}
      {historyError}
      detailsOpen={true}
    />
  {/if}
  <StrategyInstructionsPanel
    {instructions}
    busy={instructionsBusy}
    error={instructionsError}
    onCreate={onCreateInstruction}
    onUpdate={onUpdateInstruction}
    onDelete={onDeleteInstruction}
  />
</Drawer>

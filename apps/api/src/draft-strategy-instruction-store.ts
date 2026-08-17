import {
  DraftStrategyInstructionSchema,
  DraftStrategyProposalSchema,
  type DraftStrategyInstruction,
  type DraftStrategyInstructionSource,
  type DraftStrategyProposal,
} from "@sleeper-draft-assistant/shared";

import { draftStrategyInstructionsRecordCodec } from "./persisted-domain-codecs";
import type { SqliteAppDatabase } from "./sqlite-app-database";

export class DraftStrategyInstructionStore {
  constructor(private readonly database: SqliteAppDatabase) {}

  list(draftId: string, teamId: string, currentPick: number): DraftStrategyInstruction[] {
    const key = instructionKey(draftId, teamId);
    const stored = this.database.getRecord("draft_strategy_instructions", key, draftStrategyInstructionsRecordCodec) ?? [];
    const active = stored.filter(
      (instruction) => instruction.scope === "draft" || instruction.createdAtPick >= currentPick,
    );
    if (active.length !== stored.length) {
      this.write(key, active);
    }
    return active;
  }

  create(
    draftId: string,
    teamId: string,
    currentPick: number,
    input: DraftStrategyProposal,
    source: DraftStrategyInstructionSource,
  ): DraftStrategyInstruction[] {
    const proposal = DraftStrategyProposalSchema.parse(input);
    const instructions = this.list(draftId, teamId, currentPick);
    instructions.push(DraftStrategyInstructionSchema.parse({
      ...proposal,
      id: crypto.randomUUID(),
      source,
      createdAtPick: currentPick,
      createdAt: new Date().toISOString(),
    }));
    this.write(instructionKey(draftId, teamId), instructions);
    return instructions;
  }

  update(
    draftId: string,
    teamId: string,
    currentPick: number,
    instructionId: string,
    input: DraftStrategyProposal,
  ): DraftStrategyInstruction[] | null {
    const proposal = DraftStrategyProposalSchema.parse(input);
    const instructions = this.list(draftId, teamId, currentPick);
    const index = instructions.findIndex((instruction) => instruction.id === instructionId);
    if (index < 0) return null;
    instructions[index] = DraftStrategyInstructionSchema.parse({
      ...instructions[index],
      ...proposal,
      createdAtPick: proposal.scope === "next-pick" ? currentPick : instructions[index]!.createdAtPick,
    });
    this.write(instructionKey(draftId, teamId), instructions);
    return instructions;
  }

  delete(draftId: string, teamId: string, currentPick: number, instructionId: string): DraftStrategyInstruction[] | null {
    const instructions = this.list(draftId, teamId, currentPick);
    const remaining = instructions.filter((instruction) => instruction.id !== instructionId);
    if (remaining.length === instructions.length) return null;
    this.write(instructionKey(draftId, teamId), remaining);
    return remaining;
  }

  clearAll(): number {
    return this.database.clearJson("draft_strategy_instructions");
  }

  private write(key: string, instructions: DraftStrategyInstruction[]) {
    if (instructions.length === 0) this.database.deleteJson("draft_strategy_instructions", key);
    else this.database.setRecord("draft_strategy_instructions", key, draftStrategyInstructionsRecordCodec, instructions);
  }
}

function instructionKey(draftId: string, teamId: string): string {
  return `${draftId}:${teamId}`;
}

import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AiDraftDecision, DraftRecommendation, DraftState } from "@sleeper-draft-assistant/shared";

import { decisionSnapshotRecordCodec } from "./persisted-domain-codecs";
import { mutatePersistedMap } from "./persisted-cache";
import { persistedRecordError } from "./persisted-record";
import type { SqliteAppDatabase } from "./sqlite-app-database";
import { readPrivateTextFile, removePrivateFile, writePrivateFile } from "./secure-file";

export type DecisionSnapshotTrigger =
  | "state-load"
  | "rankings-import"
  | "rankings-clear"
  | "manual-refresh"
  | "ai-question"
  | "ai-strategy"
  | "candidate-evaluation"
  | "pick-update";

export type DecisionSnapshot = {
  id: string;
  draftId: string;
  leagueId: string | null;
  userRosterId: string | null;
  trigger: DecisionSnapshotTrigger;
  createdAt: string;
  draftName: string;
  status: DraftState["status"];
  currentPick: number;
  picksMade: number;
  userTeamId: string;
  userTeamName: string | null;
  recommendedPlayerId: string | null;
  headline: string;
  confidence: DraftRecommendation["confidence"];
  aiStrategy?: AiDraftDecision;
  candidatePlayerIds: string[];
  recommendation: DraftRecommendation;
  context: {
    topCandidates: Array<{
      playerId: string;
      name: string;
      position: string;
      team: string;
      orderLabel?: string;
      evidence?: string[];
      score?: number;
      reasons?: string[];
    }>;
    assumptions: string[];
    risks: string[];
  };
};

type SerializedDecisionLog = Record<string, DecisionSnapshot[]>;

export class DecisionLogStore {
  private readonly snapshotsByDraft = new Map<string, DecisionSnapshot[]>();

  constructor(
    private readonly filePath = getDefaultDecisionLogPath(),
    private readonly maxSnapshotsPerDraft = 200,
    private readonly database?: SqliteAppDatabase,
  ) {
    this.load();
  }

  record(input: {
    draftId: string;
    state: DraftState;
    recommendation: DraftRecommendation;
    aiStrategy?: AiDraftDecision;
    trigger: DecisionSnapshotTrigger;
    userRosterId?: string | null;
  }): DecisionSnapshot {
    const snapshot = createDecisionSnapshot(input);

    if (this.database) {
      const database = this.database;
      database.batch(() => {
        database.insertDecisionRecord({
          id: snapshot.id,
          draftId: snapshot.draftId,
          createdAt: snapshot.createdAt,
          trigger: snapshot.trigger,
          value: snapshot,
        }, decisionSnapshotRecordCodec);
        database.pruneDecisionSnapshots(input.draftId, this.maxSnapshotsPerDraft);
      });
    } else {
      mutatePersistedMap(this.snapshotsByDraft, () => {
        const existing = this.snapshotsByDraft.get(input.draftId) ?? [];
        this.snapshotsByDraft.set(input.draftId, [snapshot, ...existing].slice(0, this.maxSnapshotsPerDraft));
        this.save();
      });
    }

    return snapshot;
  }

  list(draftId: string, limit = 50): DecisionSnapshot[] {
    const boundedLimit = Math.max(1, Math.min(limit, this.maxSnapshotsPerDraft));
    if (this.database) return this.database.listDecisionRecords(draftId, boundedLimit, decisionSnapshotRecordCodec);
    return (this.snapshotsByDraft.get(draftId) ?? []).slice(0, boundedLimit);
  }

  clear(draftId: string): boolean {
    if (this.database) return this.database.clearDecisionSnapshots(draftId);
    return mutatePersistedMap(this.snapshotsByDraft, () => {
      const deleted = this.snapshotsByDraft.delete(draftId);
      if (deleted) this.save();
      return deleted;
    });
  }

  clearAll(): number {
    if (this.database) {
      removePrivateFile(this.filePath);
      return this.database.clearAllDecisionSnapshots();
    }
    return mutatePersistedMap(this.snapshotsByDraft, () => {
      const deleted = Array.from(this.snapshotsByDraft.values()).reduce((total, snapshots) => total + snapshots.length, 0);
      this.snapshotsByDraft.clear();
      this.save();
      return deleted;
    });
  }

  private load() {
    if (this.database) {
      const snapshots = this.database.listAllDecisionRecords(decisionSnapshotRecordCodec);
      if (snapshots.length > 0) {
        return;
      }
    }

    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as SerializedDecisionLog;
      for (const [draftId, snapshots] of Object.entries(parsed)) {
        const safeSnapshots = Array.isArray(snapshots) ? snapshots.slice(0, this.maxSnapshotsPerDraft) : [];
        const decodedSnapshots = safeSnapshots.map((snapshot) => decisionSnapshotRecordCodec.decode(snapshot).data);
        if (!this.database) this.snapshotsByDraft.set(draftId, decodedSnapshots);
        for (const snapshot of decodedSnapshots) {
          this.database?.insertDecisionRecord({
            id: snapshot.id,
            draftId: snapshot.draftId,
            createdAt: snapshot.createdAt,
            trigger: snapshot.trigger,
            value: snapshot,
          }, decisionSnapshotRecordCodec);
        }
      }
    } catch (error) {
      this.snapshotsByDraft.clear();
      throw persistedRecordError(error, "decision history");
    }
  }

  private save() {
    const serialized = Object.fromEntries(this.snapshotsByDraft.entries()) satisfies SerializedDecisionLog;
    writePrivateFile(this.filePath, `${JSON.stringify(serialized, null, 2)}\n`);
  }
}

function createDecisionSnapshot(input: {
  draftId: string;
  state: DraftState;
  recommendation: DraftRecommendation;
  aiStrategy?: AiDraftDecision;
  trigger: DecisionSnapshotTrigger;
  userRosterId?: string | null;
}): DecisionSnapshot {
  const createdAt = new Date().toISOString();
  const userTeam = input.state.teams.find((team) => team.id === input.state.userTeamId) ?? null;

  return {
    id: `${input.draftId}:${input.state.currentPick}:${input.trigger}:${createdAt}`,
    draftId: input.draftId,
    leagueId: input.state.leagueId ?? null,
    userRosterId: input.userRosterId ?? null,
    trigger: input.trigger,
    createdAt,
    draftName: input.state.name,
    status: input.state.status,
    currentPick: input.state.currentPick,
    picksMade: input.state.picks.length,
    userTeamId: input.state.userTeamId,
    userTeamName: userTeam?.name ?? null,
    recommendedPlayerId: input.recommendation.recommendedPlayerId,
    headline: input.recommendation.headline,
    confidence: input.recommendation.confidence,
    ...(input.aiStrategy ? { aiStrategy: input.aiStrategy } : {}),
    candidatePlayerIds: input.recommendation.candidates.map((candidate) => candidate.player.id),
    recommendation: input.recommendation,
    context: {
      topCandidates: input.recommendation.candidates.slice(0, 5).map((candidate) => ({
        playerId: candidate.player.id,
        name: candidate.player.name,
        position: candidate.player.position,
        team: candidate.player.team,
        orderLabel: candidate.orderLabel,
        evidence: candidate.evidence.slice(0, 4),
      })),
      assumptions: input.recommendation.assumptions,
      risks: input.recommendation.risks,
    },
  };
}

function getDefaultDecisionLogPath(): string {
  if (process.env.NODE_ENV === "test") {
    return path.join(tmpdir(), "sleeper-draft-assistant-test", "decision-log.json");
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "decision-log.json")
    : path.join(repoRoot, "data", "decision-log.json");
}

import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DraftRecommendation, DraftState } from "@sleeper-draft-assistant/shared";

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
    trigger: DecisionSnapshotTrigger;
    userRosterId?: string | null;
  }): DecisionSnapshot {
    const snapshot = createDecisionSnapshot(input);
    const existing = this.snapshotsByDraft.get(input.draftId) ?? [];
    this.snapshotsByDraft.set(input.draftId, [snapshot, ...existing].slice(0, this.maxSnapshotsPerDraft));

    if (this.database) {
      this.database.insertDecisionSnapshot({
        id: snapshot.id,
        draftId: snapshot.draftId,
        createdAt: snapshot.createdAt,
        trigger: snapshot.trigger,
        value: snapshot,
      });
      this.database.pruneDecisionSnapshots(input.draftId, this.maxSnapshotsPerDraft);
    } else {
      this.save();
    }

    return snapshot;
  }

  list(draftId: string, limit = 50): DecisionSnapshot[] {
    return (this.snapshotsByDraft.get(draftId) ?? []).slice(0, Math.max(1, Math.min(limit, this.maxSnapshotsPerDraft)));
  }

  clear(draftId: string): boolean {
    const deleted = this.snapshotsByDraft.delete(draftId);
    if (deleted) {
      if (this.database) {
        this.database.clearDecisionSnapshots(draftId);
      } else {
        this.save();
      }
    }
    return deleted;
  }

  clearAll(): number {
    const deleted = Array.from(this.snapshotsByDraft.values()).reduce((total, snapshots) => total + snapshots.length, 0);
    this.snapshotsByDraft.clear();
    if (this.database) {
      this.database.clearAllDecisionSnapshots();
    } else {
      this.save();
    }
    removePrivateFile(this.filePath);
    return deleted;
  }

  private load() {
    if (this.database) {
      const snapshots = this.database.listAllDecisionSnapshots<DecisionSnapshot>();
      for (const snapshot of snapshots) {
        const existing = this.snapshotsByDraft.get(snapshot.draftId) ?? [];
        this.snapshotsByDraft.set(snapshot.draftId, [...existing, snapshot].slice(0, this.maxSnapshotsPerDraft));
      }
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
        this.snapshotsByDraft.set(draftId, safeSnapshots);
        for (const snapshot of safeSnapshots) {
          this.database?.insertDecisionSnapshot({
            id: snapshot.id,
            draftId: snapshot.draftId,
            createdAt: snapshot.createdAt,
            trigger: snapshot.trigger,
            value: snapshot,
          });
        }
      }
    } catch {
      this.snapshotsByDraft.clear();
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

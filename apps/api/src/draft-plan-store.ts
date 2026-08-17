import { type AiDraftPlan, type AiProviderId } from "@sleeper-draft-assistant/shared";

import { draftPlanRecordCodec } from "./persisted-domain-codecs";
import type { SqliteAppDatabase } from "./sqlite-app-database";

export class DraftPlanStore {
  constructor(private readonly database: SqliteAppDatabase) {}

  get(draftId: string, teamId: string, providerId: AiProviderId): AiDraftPlan | null {
    const stored = this.database.getRecord("draft_plans", draftPlanKey(draftId, teamId), draftPlanRecordCodec);
    if (!stored || stored.providerId !== providerId) {
      return null;
    }
    return stored.plan;
  }

  set(draftId: string, teamId: string, providerId: AiProviderId, plan: AiDraftPlan): void {
    this.database.setRecord("draft_plans", draftPlanKey(draftId, teamId), draftPlanRecordCodec, {
      providerId,
      plan,
    });
  }

  clearAll(): number {
    return this.database.clearJson("draft_plans");
  }
}

function draftPlanKey(draftId: string, teamId: string): string {
  return `${draftId}:${teamId}`;
}

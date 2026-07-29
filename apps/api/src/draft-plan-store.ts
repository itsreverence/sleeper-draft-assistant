import { AiDraftPlanSchema, type AiDraftPlan, type AiProviderId } from "@sleeper-draft-assistant/shared";

import type { SqliteAppDatabase } from "./sqlite-app-database";

type StoredDraftPlan = {
  providerId: AiProviderId;
  plan: AiDraftPlan;
};

export class DraftPlanStore {
  constructor(private readonly database: SqliteAppDatabase) {}

  get(draftId: string, teamId: string, providerId: AiProviderId): AiDraftPlan | null {
    const stored = this.database.getJson<StoredDraftPlan>("draft_plans", draftPlanKey(draftId, teamId));
    if (!stored || stored.providerId !== providerId) {
      return null;
    }
    const result = AiDraftPlanSchema.safeParse(stored.plan);
    return result.success ? result.data : null;
  }

  set(draftId: string, teamId: string, providerId: AiProviderId, plan: AiDraftPlan): void {
    this.database.setJson("draft_plans", draftPlanKey(draftId, teamId), {
      providerId,
      plan: AiDraftPlanSchema.parse(plan),
    } satisfies StoredDraftPlan);
  }

  clearAll(): number {
    return this.database.clearJson("draft_plans");
  }
}

function draftPlanKey(draftId: string, teamId: string): string {
  return `${draftId}:${teamId}`;
}

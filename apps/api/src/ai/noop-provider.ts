import type { AiAnswer, AiDraftStrategy, AiProvider, AiProviderStatus, DraftQuestionContext, DraftStrategyContext, TeamAiContext } from "./types";

export class NoopAiProvider implements AiProvider {
  status(): AiProviderStatus {
    return {
      id: "noop",
      label: "Local reference only",
      configured: true,
      detail: "No external AI provider is configured.",
    };
  }

  async strategizeDraft(context: DraftStrategyContext): Promise<AiDraftStrategy> {
    const fallbackPlayers = getFallbackPlayers(context);
    const top = fallbackPlayers[0];
    if (!top) {
      throw new Error("No draft candidates are available.");
    }
    return {
      provider: this.status(),
      decision: {
        basedOnPick: context.draft.currentPick,
        recommendedPlayerId: top.playerId,
        alternativePlayerIds: fallbackPlayers.slice(1, 5).map((candidate) => candidate.playerId),
        verdict: "reasonable",
        confidence: "low",
        headline: `Reference: ${top.name}`,
        summary: `${top.name} leads the strongest populated raw-evidence group while no AI provider is available.`,
        reasons: ["First available player from the strongest populated raw-evidence group."],
        risks: ["This is not an AI-generated strategy decision."],
        plan: {
          updatedAtPick: context.draft.currentPick,
          approach: "Use the strongest populated raw-evidence group while preserving required starter flexibility.",
          currentPickFocus: [top.position],
          nextTurnPriorities: (Object.entries(context.roster.openDirectStarterSlots) as Array<[keyof typeof context.roster.openDirectStarterSlots, number]>)
            .filter(([, count]) => count > 0)
            .map(([position]) => position)
            .slice(0, 3),
          positionsThatCanWait: [],
          rosterGoals: ["Complete every required starter slot before the draft ends."],
          watchItems: ["Connect an AI provider for board-aware strategy updates."],
          changeSummary: context.previousPlan
            ? "The local reference refreshed its open starter slots for the current pick."
            : "Initial local reference created.",
        },
      },
    };
  }

  async answerDraftQuestion(context: DraftQuestionContext): Promise<AiAnswer> {
    const player = context.focusPlayers[0] ?? getFallbackPlayers(context)[0];
    const playerText = player
      ? `${player.name} (${player.position}) is present in the neutral player evidence.`
      : "There are no available players in the current draft snapshot.";

    return {
      provider: this.status(),
      answer: [
        "AI provider is not connected, so this fallback can only summarize the neutral draft evidence.",
        `Question: ${context.question}`,
        playerText,
        "Connect an AI provider for an independent strategy assessment.",
      ].join("\n\n"),
    };
  }

  async answerTeamQuestion(context: TeamAiContext): Promise<AiAnswer> {
    const topSignal = context.teamBrief.depthSignals[0] ?? "No obvious roster-structure weakness is visible from Sleeper roster data alone.";

    return {
      provider: this.status(),
      answer: [
        "AI provider is not connected yet, so this answer is using the deterministic Sleeper team context.",
        `Question: ${context.question}`,
        `Team: ${context.teamBrief.teamName} (${context.teamBrief.leagueFormat})`,
        topSignal,
        context.teamBrief.lineupStatus,
      ].join("\n\n"),
    };
  }
}

function getFallbackPlayers(
  context: Pick<DraftStrategyContext, "playerEvidence" | "playerEvidenceGroups">,
) {
  const playersById = new Map(context.playerEvidence.map((player) => [player.playerId, player]));
  const orderedIds = [
    ...context.playerEvidenceGroups.ecrLeaders,
    ...context.playerEvidenceGroups.projectionLeaders,
    ...context.playerEvidenceGroups.sleeperAdpLeaders,
    ...context.playerEvidenceGroups.realTimeAdpLeaders,
    ...context.playerEvidenceGroups.sleeperSearchRankLeaders,
    ...Object.values(context.playerEvidenceGroups.positionCoverage).flat(),
    ...context.playerEvidenceGroups.pinnedTargets,
  ];

  return Array.from(new Set(orderedIds)).flatMap((playerId) => {
    const player = playersById.get(playerId);
    return player ? [player] : [];
  });
}

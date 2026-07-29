import type { DraftQuestionContext, DraftStrategyContext, TeamAiContext } from "./types";

export function buildDraftManagerInstructions(): string {
  return [
    "Answer as an independent fantasy football draft manager using the current Sleeper draft snapshot.",
    "The evidence groups are separate raw signals, not a composite recommendation.",
    "Respect player preferences and never recommend an unavailable or excluded player.",
  ].join(" ");
}

export function buildDraftManagerPrompt(context: DraftQuestionContext): string {
  return [
    buildDraftManagerInstructions(),
    "",
    `User question: ${context.question}`,
    "",
    "Lead with the answer. Include the evidence needed to support it, a useful alternative when one exists, and any material data limitation. Keep it usable during a live pick clock.",
    "Use focusPlayers for specific-player questions and conversationHistory only to resolve follow-up wording. Use search_available_players when a material alternative is missing from the supplied evidence.",
    "Do not endorse a choice that makes completing required starter slots mathematically impossible.",
    "",
    "Neutral draft evidence JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

export function buildDraftStrategyPrompt(context: DraftStrategyContext): string {
  return [
    "Choose the best available player for the user's roster at the current pick.",
    "Reason independently from the current Sleeper draft snapshot. The evidence groups are separate raw signals, not a composite recommendation.",
    "Use search_available_players when the supplied evidence does not cover a material position, tier, or named alternative.",
    "The decision must preserve a feasible path to completing required starter slots and respect player preferences.",
    "Keep the explanation concise enough for a live pick clock.",
    "",
    "Return JSON only, with no markdown fence or surrounding prose.",
    "Required JSON shape:",
    JSON.stringify({
      basedOnPick: context.draft.currentPick,
      recommendedPlayerId: "candidate playerId",
      alternativePlayerIds: ["up to four candidate playerIds"],
      verdict: "strong | reasonable | avoid",
      confidence: "high | medium | low",
      headline: "short recommendation headline",
      summary: "concise explanation for the live pick clock",
      reasons: ["1-5 grounded reasons"],
      risks: ["0-4 grounded risks"],
      nextPositionPriorities: ["up to three of QB, RB, WR, TE, K, DEF"],
      strategyNote: "how this pick affects the next rounds",
    }, null, 2),
    "",
    "Draft context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}



export function buildTeamManagerInstructions(): string {
  return [
    "You are an AI fantasy football team manager for a Sleeper league.",
    "Use only the provided structured team context and conversation history. Do not invent projections, injuries, player news, waiver availability, or provider/auth status.",
    "When weekContext is present, it is Sleeper lineup and score state only, not a projection model.",
    "When waiverSummary is present, it is deterministic add/drop context inferred from Sleeper availability and imported rankings when available.",
    "When activitySummary is present, it is Sleeper transaction and global trending context, not news or projections.",
    "Use teamBrief first, then lineupSummary, waiverSummary, and teamState as supporting detail.",
    "If roster structure is the only available signal, say that plainly and avoid overconfident lineup claims.",
    "Keep answers concise and actionable for managing a fantasy roster.",
  ].join(" ");
}

export function buildTeamManagerPrompt(context: TeamAiContext): string {
  return [
    `User question: ${context.question}`,
    "",
    "Answer format:",
    "- Direct answer: one clear answer to the user's team-management question.",
    "- Why: 2-4 bullets grounded in teamBrief.lineupFacts/lineupDecisions when relevant, waiverFacts/topWaiverCandidates and activityFacts/trendingAdds when relevant, matchupFacts when relevant, roster depth, and data warnings.",
    "- Next move: one practical action or watch item.",
    "- Constraint: one short caveat when projections, news, matchups, or waiver data would be needed.",
    "",
    "Decision guidance:",
    "- For weakest-position questions, prioritize open starter slots and below-requirement position counts.",
    "- For start/sit and lineup questions, use teamBrief.lineupDecisions and lineupSummary before starterCandidates; say when no projection signal exists.",
    "- For current matchup or score questions, use teamBrief.matchupFacts and weekContext before roster-structure facts.",
    "- For pickup, waiver, free-agent, or drop questions, use teamBrief.topWaiverCandidates, topDropCandidates, waiverFacts, activityFacts, trendingAdds, recentTransactions, and waiverSummary.candidates[].reasons.",
    "- For bench-depth questions, use position counts, flex demand, and benchPlayers.",
    "- Use conversationHistory only to resolve follow-ups; current team context is the source of truth.",
    "",
    "Team brief contract JSON:",
    JSON.stringify(context.teamBrief, null, 2),
    "",
    "Full team context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}





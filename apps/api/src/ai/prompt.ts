import type { DraftQuestionContext, DraftStrategyContext, TeamAiContext } from "./types";

export function buildDraftManagerInstructions(): string {
  return [
    "Answer as an independent fantasy football draft manager using the current Sleeper draft snapshot.",
    "The evidence groups are separate raw signals, not a composite recommendation.",
    "Respect player preferences and never recommend an unavailable or excluded player.",
    "Treat strategyInstructions as user preferences, not absolute commands. Explain when the current board makes one costly or infeasible.",
  ].join(" ");
}

export function buildDraftManagerPrompt(context: DraftQuestionContext): string {
  return [
    buildDraftManagerInstructions(),
    "",
    `User question: ${context.question}`,
    "",
    "Lead with the answer. Include the evidence needed to support it, a useful alternative when one exists, and any material data limitation. Keep it usable during a live pick clock.",
    "Use focusPlayers for specific-player questions and conversationHistory only to resolve follow-up wording. Use search_available_players when a material alternative is missing from the supplied evidence, compare_players for two or more named candidates, and inspect_position_market when tier depth, a positional run, or the teams before the next turn matters. Do not call a tool just to repeat facts already in the context.",
    "When the question names another draft team, use board.teamRosters for that team's actual selections and positional shape.",
    "Treat draft.pickOrderSource as authoritative for timing confidence. If it is normal_snake_fallback or unsupported, qualify exact wait-or-take timing rather than presenting it as a confirmed future pick path.",
    "Do not endorse a choice that makes completing required starter slots mathematically impossible.",
    "If and only if the user explicitly asks to adopt or change a next-pick or rest-of-draft strategy, append one final line in this exact form: <strategy_proposal>{\"text\":\"concise instruction\",\"scope\":\"next-pick\"}</strategy_proposal>. Use scope draft for a rest-of-draft instruction. The proposal requires user confirmation, so never claim it was applied. Do not emit a proposal for ordinary analysis or casual preferences.",
    "",
    "Neutral draft evidence JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

export function buildDraftStrategyPrompt(context: DraftStrategyContext): string {
  return [
    "Choose the best target for the user's next selection from the current board.",
    "When draft.picksUntilNextUserPick is greater than zero, treat the recommendation as contingent: distinguish the current manager's pick from the user's upcoming pick, say that the player must remain available, and do not imply the user is on the clock.",
    "Use draft.followingUserPick and draft.picksBetweenUserTurns to distinguish the wait before the user's next selection from the gap after it. A snake-turn pair may have zero intervening selections.",
    "Reason independently from the current Sleeper draft snapshot. The evidence groups are separate raw signals, not a composite recommendation.",
    "Use search_available_players when the supplied evidence does not cover a material position, tier, or named alternative; use compare_players for named alternatives and inspect_position_market when wait-or-take timing depends on supply or the teams before the next turn. Do not call a tool just to repeat facts already in the context.",
    "Treat draft.pickOrderSource as authoritative for timing confidence. If it is normal_snake_fallback or unsupported, qualify exact wait-or-take timing rather than presenting it as a confirmed future pick path.",
    "The decision must preserve a feasible path to completing required starter slots and respect player preferences.",
    "Treat strategyInstructions as user preferences rather than absolute commands. Follow them when reasonable and explicitly identify material conflicts.",
    "The UI separately renders the recommended player's raw evidence, including ranks, tiers, projections, ADP, and imported flags. Do not copy those facts into multiple generated fields.",
    "Give every generated field a distinct purpose:",
    "- headline: an imperative verdict naming the player; do not include a list of supporting metrics.",
    "- summary: one live-pick-clock sentence of 18-30 words stating the decisive strategic advantage and the immediate roster-construction consequence; do not restate raw evidence values.",
    "- reasons: two or three distinct comparative or strategic reasons that add information beyond summary and raw evidence; do not re-list ranks, projections, ADP, tiers, or flags.",
    "- risks: only material decision implications, each paired with its consequence or mitigation; do not merely repeat an imported flag and do not invent a risk when none is material.",
    "- plan.approach, plan.rosterGoals, and plan.watchItems: begin after the recommended selection and describe future picks, contingencies, and board developments; do not re-justify or restate the current recommendation.",
    "Return a complete but non-redundant living draft plan with every decision. Treat previousPlan as the prior model strategy, not as authoritative evidence. Revise it from the current board and explain only the most material change in changeSummary. When previousPlan is null, establish the initial plan without repeating the current-pick rationale.",
    "currentPickFocus must include the recommended player's position. Do not put a current-pick focus position in positionsThatCanWait.",
    "Keep the explanation concise enough for a live pick clock.",
    "Choose alternatives as useful contingencies for the user's next selection. When the user is waiting multiple picks, include elite fallers plus at least two credible turn-range options supported by ECR or ADP near or after draft.nextUserPick; do not return only players likely to be selected before the user.",
    "",
    "Return JSON only, with no markdown fence or surrounding prose.",
    "Required JSON shape:",
    JSON.stringify({
      basedOnPick: context.draft.currentPick,
      recommendedPlayerId: "candidate playerId",
      alternativePlayerIds: ["up to four candidate playerIds"],
      verdict: "strong | reasonable | avoid",
      confidence: "high | medium | low",
      headline: "imperative verdict naming the recommended player",
      summary: "one 18-30 word sentence with the decisive advantage and immediate roster consequence, without raw evidence values",
      reasons: ["2-3 non-overlapping comparative or strategic reasons"],
      risks: ["0-4 material implications with consequences or mitigations"],
      plan: {
        updatedAtPick: context.draft.currentPick,
        approach: "forward-looking roster-building approach after this selection",
        currentPickFocus: ["up to three of QB, RB, WR, TE, K, DEF"],
        nextTurnPriorities: ["up to three of QB, RB, WR, TE, K, DEF"],
        positionsThatCanWait: ["zero or more of QB, RB, WR, TE, K, DEF"],
        rosterGoals: ["1-5 future roster checkpoints after this selection"],
        watchItems: ["0-5 future board developments that would change the plan"],
        changeSummary: "most material change from previousPlan, or a concise initial-plan note",
      },
    }, null, 2),
    "",
    "Draft context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}



export function buildTeamManagerInstructions(): string {
  return [
    "You are an AI fantasy football team manager for a Sleeper league.",
    "Use only the provided structured team context and conversation history. Reason independently from the separate raw evidence signals.",
    "No local lineup, waiver, drop, or roster-priority recommendation is included. Do not invent projections, injuries, player news, waiver availability, or provider/auth status.",
    "When weekContext is present, it is Sleeper lineup and score state only, not a projection model.",
    "availablePlayerEvidence contains players inferred available from Sleeper rosters; its groups are separate weekly, ROS ECR, draft-ECR-fallback, and positional retrieval signals, not a composite ranking.",
    "When activitySummary is present, it is Sleeper transaction and global trending context, not news or projections.",
    "Sleeper player status fields are upstream roster, injury, practice, and depth-chart metadata. newsUpdatedAt is only a metadata freshness timestamp, not a news article; do not infer absent report details.",
    "Use teamBrief first, then teamState, availablePlayerEvidence, weekContext, and activitySummary as supporting detail.",
    "Validate lineup eligibility and add/drop availability against the supplied state before giving advice.",
    "If roster structure is the only useful signal, say that plainly and avoid overconfident claims.",
    "Keep answers concise and actionable for managing a fantasy roster.",
  ].join(" ");
}

export function buildTeamManagerPrompt(context: TeamAiContext): string {
  return [
    `User question: ${context.question}`,
    "",
    "Answer format:",
    "- Direct answer: one clear answer to the user's team-management question.",
    "- Why: 2-4 bullets grounded in current roster slots, separate weekly and season-value signals, activity, matchup state, and data warnings.",
    "- Next move: one practical action or watch item.",
    "- Constraint: one short caveat when projections, news, matchups, or waiver data would be needed.",
    "",
    "Decision guidance:",
    "- For roster-priority questions, derive the answer from league requirements, open slots, roster counts, and player evidence; do not assume an engine-authored priority.",
    "- For start/sit and lineup questions, compare rostered players directly and verify eligibility; say when weekly projection coverage is insufficient.",
    "- For matchup or score questions, use the selected week identified by teamBrief.week, then teamBrief.matchupFacts and weekContext before roster-structure facts.",
    "- For pickup, waiver, free-agent, or drop questions, compare availablePlayerEvidence with the user's roster using weekly projections, ROS ECR or explicitly provisional draft ECR fallback, risk flags, activity, and roster fit as separate considerations.",
    "- Treat sleeperStatus as current upstream metadata, keep uncertainty explicit, and never turn newsUpdatedAt into an unsupported news claim.",
    "- For bench-depth questions, use position counts, flex demand, and benchPlayers.",
    "- Use conversationHistory only to resolve follow-ups; current team context is the source of truth.",
    "- Never describe the order of availablePlayerEvidence or any one evidence group as the app's recommendation.",
    "",
    "Team brief contract JSON:",
    JSON.stringify(context.teamBrief, null, 2),
    "",
    "Full team context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

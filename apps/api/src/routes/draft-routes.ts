import {
  advanceMockDraftState,
  buildDraftOptionForPlayer,
  buildDraftRecommendation,
  createMockDraftState,
  isDraftChoiceRosterFeasible,
  type DraftRecommendationOptions,
} from "@sleeper-draft-assistant/engine";
import {
  AdpImportRequestSchema,
  DraftStrategyInstructionSourceSchema,
  DraftStrategyProposalSchema,
  RankingImportRequestSchema,
  SeasonProjectionImportRequestSchema,
  type AdpImportSummary,
  type DraftRecommendation,
  type DraftState,
  type RankingImportSummary,
  type SeasonProjectionImportSummary,
} from "@sleeper-draft-assistant/shared";
import type { Hono } from "hono";

import { buildDraftQuestionContext, buildDraftStrategyContext } from "../ai/context";
import { createDraftPlayerSnapshot, createDraftStrategyTools } from "../ai/draft-tools";
import type { AiProviderManager } from "../ai/provider-factory";
import type { DecisionLogStore, DecisionSnapshotTrigger } from "../decision-log-store";
import type { DraftPlanStore } from "../draft-plan-store";
import type { DraftStrategyInstructionStore } from "../draft-strategy-instruction-store";
import { draftPollDelayMs } from "../draft-refresh";
import {
  AdpImportStore,
  SeasonProjectionImportStore,
  importFantasyProsAdpCsv,
  importFantasyProsSeasonProjectionCsvs,
} from "../draft-value-import";
import { createEventStreamChannel } from "../event-stream";
import type { LocalDataResetCoordinator } from "../local-data-reset";
import {
  RankingImportStore,
  importFantasyProsCsv,
  isDraftRankingImportCompatible,
} from "../rankings-import";
import type { SettingsStore } from "../settings-store";
import type { SleeperClient } from "../sleeper";
import type { SqliteAppDatabase } from "../sqlite-app-database";
import type { RouteErrorHandler } from "./types";
import { getUserRosterId, normalizeConversationHistory } from "./request-context";

type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
  seasonProjectionImportSummary: SeasonProjectionImportSummary | null;
  adpImportSummary: AdpImportSummary | null;
};

type DraftPayloadOptions = {
  recommendation?: DraftRecommendation;
  recordTrigger?: DecisionSnapshotTrigger;
  userRosterId?: string | null;
};

type DraftRouteDependencies = {
  sleeperClient: SleeperClient;
  aiProviderManager: AiProviderManager;
  appDatabase: SqliteAppDatabase;
  localDataReset: LocalDataResetCoordinator;
  getSettingsStore: () => SettingsStore;
  getRankingImportStore: () => RankingImportStore;
  getSeasonProjectionImportStore: () => SeasonProjectionImportStore;
  getAdpImportStore: () => AdpImportStore;
  getDecisionLogStore: () => DecisionLogStore;
  getDraftPlanStore: () => DraftPlanStore;
  getDraftStrategyInstructionStore: () => DraftStrategyInstructionStore;
  handleRouteError: RouteErrorHandler;
  logRouteErrorMessage: (context: string, error: unknown) => void;
};

export function createDraftRoutes(dependencies: DraftRouteDependencies) {
  const {
    sleeperClient,
    aiProviderManager,
    appDatabase,
    localDataReset,
    getSettingsStore,
    getRankingImportStore,
    getSeasonProjectionImportStore,
    getAdpImportStore,
    getDecisionLogStore,
    getDraftPlanStore,
    getDraftStrategyInstructionStore,
    handleRouteError,
    logRouteErrorMessage,
  } = dependencies;
  let mockState = createMockDraftState(8);

  return {
    registerGuidanceRoutes,
    registerWorkspaceRoutes,
  };

  function registerGuidanceRoutes(app: Hono): void {
    app.get("/drafts/:draftId/strategy-instructions", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        return c.json({
          instructions: getDraftStrategyInstructionStore().list(draftId, state.userTeamId, state.currentPick),
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/strategy-instructions", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const body = await c.req.json<Record<string, unknown>>();
        const proposal = DraftStrategyProposalSchema.parse(body);
        const source = DraftStrategyInstructionSourceSchema.parse(body.source ?? "manual");
        return c.json({
          instructions: getDraftStrategyInstructionStore().create(
            draftId,
            state.userTeamId,
            state.currentPick,
            proposal,
            source,
          ),
        }, 201);
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.put("/drafts/:draftId/strategy-instructions/:instructionId", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const proposal = DraftStrategyProposalSchema.parse(await c.req.json<Record<string, unknown>>());
        const instructions = getDraftStrategyInstructionStore().update(
          draftId,
          state.userTeamId,
          state.currentPick,
          c.req.param("instructionId"),
          proposal,
        );
        return instructions ? c.json({ instructions }) : c.json({ error: "Strategy instruction not found." }, 404);
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.delete("/drafts/:draftId/strategy-instructions/:instructionId", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const instructions = getDraftStrategyInstructionStore().delete(
          draftId,
          state.userTeamId,
          state.currentPick,
          c.req.param("instructionId"),
        );
        return instructions ? c.json({ instructions }) : c.json({ error: "Strategy instruction not found." }, 404);
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.get("/drafts/mock/state", (c) => {
      return c.json(toDraftPayload(applyDraftData("mock-draft", mockState), "mock-draft"));
    });
  }

  function registerWorkspaceRoutes(app: Hono): void {
    app.get("/drafts/:draftId/state", async (c) => {
      try {
        const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c), c.req.query("userIdentifier"));
        const draftId = c.req.param("draftId");
        return c.json(toDraftPayload(state, draftId, { recordTrigger: "state-load", userRosterId: getUserRosterId(c) }));
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/rankings/import", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const body = RankingImportRequestSchema.parse(await c.req.json());
        const storedImport = importFantasyProsCsv(state, body.csvText, body.scoring);
        if (!isDraftRankingImportCompatible(state, storedImport)) {
          return c.json({
            error: `The ${body.scoring} rankings do not match this ${state.settings.scoring} league.`,
          }, 400);
        }
        getRankingImportStore().set(draftId, storedImport);
        const importedState = applyDraftData(draftId, state);

        return c.json({
          summary: storedImport.summary,
          ...toDraftPayload(importedState, draftId, { recordTrigger: "rankings-import", userRosterId: getUserRosterId(c) }),
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/projections/season/import", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const body = SeasonProjectionImportRequestSchema.parse(await c.req.json());
        const storedImport = importFantasyProsSeasonProjectionCsvs({
          state,
          season: body.season,
          files: body.files,
        });
        getSeasonProjectionImportStore().set(draftId, storedImport);
        return c.json({
          summary: storedImport.summary,
          ...toDraftPayload(applyDraftData(draftId, state), draftId, {
            recordTrigger: "rankings-import",
            userRosterId: getUserRosterId(c),
          }),
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.delete("/drafts/:draftId/projections/season/import", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        getSeasonProjectionImportStore().delete(draftId);
        const state = await loadDraftState(draftId, getUserRosterId(c));
        return c.json(toDraftPayload(state, draftId, {
          recordTrigger: "rankings-clear",
          userRosterId: getUserRosterId(c),
        }));
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/adp/import", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const body = AdpImportRequestSchema.parse(await c.req.json());
        const storedImport = importFantasyProsAdpCsv({
          state,
          season: body.season,
          csvText: body.csvText,
        });
        getAdpImportStore().set(draftId, storedImport);
        return c.json({
          summary: storedImport.summary,
          ...toDraftPayload(applyDraftData(draftId, state), draftId, {
            recordTrigger: "rankings-import",
            userRosterId: getUserRosterId(c),
          }),
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.delete("/drafts/:draftId/adp/import", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        getAdpImportStore().delete(draftId);
        const state = await loadDraftState(draftId, getUserRosterId(c));
        return c.json(toDraftPayload(state, draftId, {
          recordTrigger: "rankings-clear",
          userRosterId: getUserRosterId(c),
        }));
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.delete("/drafts/:draftId/rankings/import", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        getRankingImportStore().delete(draftId);
        const state = await loadDraftState(draftId, getUserRosterId(c));
        return c.json(toDraftPayload(state, draftId, { recordTrigger: "rankings-clear", userRosterId: getUserRosterId(c) }));
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.get("/drafts/:draftId/recommendations", async (c) => {
      try {
        const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
        const draftId = c.req.param("draftId");
        const recommendation = buildDraftRecommendation(state);
        getDecisionLogStore().record({ draftId, state, recommendation, trigger: "manual-refresh", userRosterId: getUserRosterId(c) });
        return c.json(recommendation);
      } catch (error) {
        return handleRouteError(c, error);
      }
    });
    app.post("/drafts/:draftId/recommendations", async (c) => {
      try {
        const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
        const body = (await c.req.json<{ recommendationPreferences?: DraftRecommendationOptions["preferences"] }>().catch(() => ({}))) as { recommendationPreferences?: DraftRecommendationOptions["preferences"] };
        const draftId = c.req.param("draftId");
        const recommendation = buildDraftRecommendation(state, { preferences: normalizeRecommendationPreferences(body.recommendationPreferences) });
        getDecisionLogStore().record({ draftId, state, recommendation, trigger: "manual-refresh", userRosterId: getUserRosterId(c) });
        return c.json(recommendation);
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/strategy", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const body = await c.req
          .json<{
            userPreferences?: { pinned?: string[]; faded?: string[]; excluded?: string[] };
            recommendationPreferences?: DraftRecommendationOptions["preferences"];
          }>()
          .catch(() => ({ userPreferences: undefined, recommendationPreferences: undefined }));
        const recommendationPreferences = normalizeRecommendationPreferences(body.recommendationPreferences);
        const recommendation = buildDraftRecommendation(state, { preferences: recommendationPreferences });
        const snapshot = createDraftPlayerSnapshot(state, {
          pinned: recommendationPreferences?.pinnedPlayerIds ?? [],
          faded: recommendationPreferences?.fadedPlayerIds ?? [],
          excluded: recommendationPreferences?.excludedPlayerIds ?? [],
        });
        if (snapshot.players.every((player) => snapshot.preferences.excluded.has(player.id))) {
          return c.json({ error: "No available players can be evaluated for this pick." }, 409);
        }
        const tools = createDraftStrategyTools(snapshot);
        const provider = aiProviderManager.get(getSettingsStore().get());
        const providerStatus = provider.status();
        const storedPlan = getDraftPlanStore().get(draftId, state.userTeamId, providerStatus.id);
        const previousPlan = storedPlan && storedPlan.updatedAtPick <= state.currentPick ? storedPlan : null;
        const strategyInstructions = getDraftStrategyInstructionStore().list(draftId, state.userTeamId, state.currentPick);
        const strategyContext = buildDraftStrategyContext(
          state,
          normalizeUserPreferences(body.userPreferences),
          snapshot,
          previousPlan,
          strategyInstructions,
        );
        const requestGeneration = localDataReset.captureGeneration();
        const strategy = await provider.strategizeDraft(
          strategyContext,
          tools,
        );
        if (!localDataReset.isCurrent(requestGeneration)) {
          return c.json({ error: "Local data was reset while AI strategy was running. Request a fresh recommendation." }, 409);
        }
        const latestState = await loadDraftState(draftId, getUserRosterId(c));
        if (latestState.currentPick !== state.currentPick) {
          return c.json({ error: "The draft board changed while AI strategy was running. Refreshing the recommendation." }, 409);
        }
        const availableIds = new Set(
          snapshot.players
            .filter((player) => !snapshot.preferences.excluded.has(player.id))
            .map((player) => player.id),
        );
        const recommendedCandidate = availableIds.has(strategy.decision.recommendedPlayerId)
          ? buildDraftOptionForPlayer(state, strategy.decision.recommendedPlayerId, { preferences: recommendationPreferences })
          : null;
        if (
          strategy.decision.basedOnPick !== state.currentPick ||
          strategy.decision.plan.updatedAtPick !== state.currentPick ||
          !recommendedCandidate ||
          !isDraftChoiceRosterFeasible(state, recommendedCandidate.player.id)
        ) {
          return c.json({ error: "The AI strategy did not match the current draft board." }, 502);
        }
        const alternativeCandidates = Array.from(new Set(strategy.decision.alternativePlayerIds))
          .filter((playerId) => playerId !== recommendedCandidate.player.id)
          .filter((playerId) => availableIds.has(playerId) && isDraftChoiceRosterFeasible(state, playerId))
          .map((playerId) => buildDraftOptionForPlayer(state, playerId, { preferences: recommendationPreferences }))
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
          .slice(0, 4);
        const currentPickFocus = Array.from(new Set([
          recommendedCandidate.player.position,
          ...strategy.decision.plan.currentPickFocus,
        ])).slice(0, 3);
        const decision = {
          ...strategy.decision,
          headline: (state.status === "pre_draft"
            || (strategyContext.draft.picksUntilNextUserPick !== null
              && strategyContext.draft.picksUntilNextUserPick > 0))
            && strategyContext.draft.nextUserPick !== null
            ? `Target ${recommendedCandidate.player.name} at ${formatDraftPick(strategyContext.draft.nextUserPick, state.settings.teams)} if available`
            : `Take ${recommendedCandidate.player.name}`,
          alternativePlayerIds: alternativeCandidates.map((candidate) => candidate.player.id),
          plan: {
            ...strategy.decision.plan,
            currentPickFocus,
            positionsThatCanWait: strategy.decision.plan.positionsThatCanWait.filter(
              (position) => !currentPickFocus.includes(position),
            ),
          },
        };
        const persisted = localDataReset.commitIfCurrent(requestGeneration, () => {
          appDatabase.batch(() => {
            if (strategy.provider.id !== "noop") {
              getDraftPlanStore().set(draftId, state.userTeamId, strategy.provider.id, decision.plan);
            }

            getDecisionLogStore().record({
              draftId,
              state,
              recommendation: {
                ...recommendation,
                headline: decision.headline,
                recommendedPlayerId: recommendedCandidate.player.id,
                confidence: decision.confidence,
                summary: decision.summary,
                risks: decision.risks,
                candidates: [recommendedCandidate, ...alternativeCandidates],
              },
              aiStrategy: decision,
              trigger: "ai-strategy",
              userRosterId: getUserRosterId(c),
            });
          });
        });
        if (!persisted) {
          return c.json({ error: "Local data was reset while AI strategy was running. Request a fresh recommendation." }, 409);
        }

        return c.json({
          provider: strategy.provider,
          pickNumber: state.currentPick,
          decision,
          recommendedCandidate,
          alternativeCandidates,
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/ask", async (c) => {
      try {
        const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
        const body = await c.req
          .json<{ question?: string; conversationHistory?: Array<{ role?: string; content?: string }>; userPreferences?: { pinned?: string[]; faded?: string[]; excluded?: string[] }; recommendationPreferences?: DraftRecommendationOptions["preferences"] }>()
          .catch(() => ({ question: "", conversationHistory: [], userPreferences: undefined, recommendationPreferences: undefined }));
        const question = body.question?.trim() ?? "";
        if (!question) {
          return c.json({ error: "Ask a question before requesting AI advice." }, 400);
        }
        const conversationHistory = normalizeConversationHistory(body.conversationHistory);
        const userPreferences = normalizeUserPreferences(body.userPreferences);
        const draftId = c.req.param("draftId");
        const recommendationPreferences = normalizeRecommendationPreferences(body.recommendationPreferences);
        const recommendation = buildDraftRecommendation(state, { preferences: recommendationPreferences });
        const snapshot = createDraftPlayerSnapshot(state, {
          pinned: recommendationPreferences?.pinnedPlayerIds ?? userPreferences.pinned,
          faded: recommendationPreferences?.fadedPlayerIds ?? userPreferences.faded,
          excluded: recommendationPreferences?.excludedPlayerIds ?? userPreferences.excluded,
        });
        getDecisionLogStore().record({ draftId, state, recommendation, trigger: "ai-question", userRosterId: getUserRosterId(c) });
        const aiProvider = aiProviderManager.get(getSettingsStore().get());
        const strategyInstructions = getDraftStrategyInstructionStore().list(draftId, state.userTeamId, state.currentPick);
        const aiAnswer = await aiProvider.answerDraftQuestion(
          buildDraftQuestionContext(state, question, conversationHistory, userPreferences, snapshot, [], strategyInstructions),
          createDraftStrategyTools(snapshot),
        );

        return c.json({
          provider: aiAnswer.provider,
          question,
          answer: aiAnswer.answer,
          strategyProposal: aiAnswer.strategyProposal ?? null,
          recommendation,
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.post("/drafts/:draftId/candidates/:playerId/evaluate", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const playerId = c.req.param("playerId");
        const state = await loadDraftState(draftId, getUserRosterId(c));
        const body = (await c.req
          .json<{ recommendationPreferences?: DraftRecommendationOptions["preferences"] }>()
          .catch(() => ({}))) as { recommendationPreferences?: DraftRecommendationOptions["preferences"] };
        const recommendationPreferences = normalizeRecommendationPreferences(body.recommendationPreferences);
        const recommendation = buildDraftRecommendation(state, { preferences: recommendationPreferences });
        const userPreferences = {
          pinned: recommendationPreferences?.pinnedPlayerIds ?? [],
          faded: recommendationPreferences?.fadedPlayerIds ?? [],
          excluded: recommendationPreferences?.excludedPlayerIds ?? [],
        };
        const strategyInstructions = getDraftStrategyInstructionStore().list(
          draftId,
          state.userTeamId,
          state.currentPick,
        );
        const snapshot = createDraftPlayerSnapshot(state, userPreferences);
        const candidate = snapshot.players.find(
          (player) => player.id === playerId && !snapshot.preferences.excluded.has(player.id),
        );
        if (!candidate) {
          return c.json({ error: "That player is no longer available for this draft pick." }, 409);
        }

        getDecisionLogStore().record({
          draftId,
          state,
          recommendation,
          trigger: "candidate-evaluation",
          userRosterId: getUserRosterId(c),
        });
        const question = [
          `Evaluate drafting ${candidate.name} (${candidate.position}, ${candidate.team}) at pick ${state.currentPick}.`,
          "Give a direct verdict using Prefer, Reasonable, or Avoid.",
          "Then provide 2-4 concise reasons, search for the strongest credible alternative, and give the next two positional priorities if this player is selected.",
          "Reason independently from the roster, board, settings, and raw player evidence; identify important data limitations.",
          "Do not claim access to news or information outside the supplied draft context.",
        ].join(" ");
        const aiProvider = aiProviderManager.get(getSettingsStore().get());
        const aiAnswer = await aiProvider.answerDraftQuestion(
          buildDraftQuestionContext(state, question, [], userPreferences, snapshot, [playerId], strategyInstructions),
          createDraftStrategyTools(snapshot),
        );
        const latestState = await loadDraftState(draftId, getUserRosterId(c));
        if (latestState.currentPick !== state.currentPick) {
          return c.json({ error: "The draft board changed while AI evaluation was running. Refreshing the recommendation." }, 409);
        }

        return c.json({
          provider: aiAnswer.provider,
          playerId,
          playerName: candidate.name,
          pickNumber: state.currentPick,
          answer: aiAnswer.answer,
        });
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

    app.get("/drafts/:draftId/decisions", (c) => {
      const limit = Number(c.req.query("limit") ?? 50);
      return c.json({ snapshots: getDecisionLogStore().list(c.req.param("draftId"), Number.isFinite(limit) ? limit : 50) });
    });

    app.get("/drafts/:draftId/events", async (c) => {
      try {
        const draftId = c.req.param("draftId");
        const userRosterId = getUserRosterId(c);

        if (isMockDraft(draftId)) {
          return streamMockDraftEvents();
        }

        return await streamSleeperDraftEvents(draftId, userRosterId);
      } catch (error) {
        return handleRouteError(c, error);
      }
    });

  }

  async function loadDraftState(
    draftId: string,
    userRosterId?: string | null,
    userIdentifier?: string | null,
  ): Promise<DraftState> {
    if (isMockDraft(draftId)) {
      return applyDraftData(draftId, mockState);
    }

    const state = await sleeperClient.getDraftState(draftId, userRosterId, userIdentifier);
    return applyDraftData(draftId, state);
  }

  function applyDraftData(draftId: string, state: DraftState): DraftState {
    return getAdpImportStore().apply(
      draftId,
      getSeasonProjectionImportStore().apply(draftId, getRankingImportStore().apply(draftId, state)),
    );
  }

  function toDraftPayload(state: DraftState, draftId: string, options: DraftPayloadOptions = {}): DraftPayload {
    const recommendation = options.recommendation ?? buildDraftRecommendation(state);
    if (options.recordTrigger) {
      getDecisionLogStore().record({
        draftId,
        state,
        recommendation,
        trigger: options.recordTrigger,
        userRosterId: options.userRosterId,
      });
    }

    return {
      state,
      recommendation,
      rankingImportSummary: getRankingImportStore().get(draftId)?.summary ?? null,
      seasonProjectionImportSummary: getSeasonProjectionImportStore().get(draftId)?.summary ?? null,
      adpImportSummary: getAdpImportStore().get(draftId)?.summary ?? null,
    };
  }


  function normalizeRecommendationPreferences(preferences: DraftRecommendationOptions["preferences"] | undefined): DraftRecommendationOptions["preferences"] {
    return {
      pinnedPlayerIds: normalizePreferenceNames(preferences?.pinnedPlayerIds),
      fadedPlayerIds: normalizePreferenceNames(preferences?.fadedPlayerIds),
      excludedPlayerIds: normalizePreferenceNames(preferences?.excludedPlayerIds),
    };
  }
  function normalizeUserPreferences(preferences: { pinned?: string[]; faded?: string[]; excluded?: string[] } | undefined) {
    return {
      pinned: normalizePreferenceNames(preferences?.pinned),
      faded: normalizePreferenceNames(preferences?.faded),
      excluded: normalizePreferenceNames(preferences?.excluded),
    };
  }

  function normalizePreferenceNames(names: string[] | undefined): string[] {
    return Array.from(new Set((names ?? []).map((name) => name.trim()).filter(Boolean))).slice(0, 20);
  }
  function isMockDraft(draftId: string): boolean {
    return draftId === "mock" || draftId === "mock-draft";
  }

  function streamMockDraftEvents(): Response {
    const channel = createEventStreamChannel();
    let localState: DraftState = applyDraftData("mock-draft", mockState);
    let interval: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        channel.send(controller, "snapshot", {
          type: "snapshot",
          ...toDraftPayload(localState, "mock-draft"),
        });

        interval = setInterval(() => {
          if (localState.status === "complete") {
            channel.send(controller, "heartbeat", {
              type: "heartbeat",
              at: new Date().toISOString(),
            });
            return;
          }

          const previousPickCount = mockState.picks.length;
          mockState = advanceMockDraftState(mockState);
          localState = applyDraftData("mock-draft", mockState);
          const pick = localState.picks[previousPickCount];

          channel.send(controller, "pick", {
            type: "pick",
            pick,
            ...toDraftPayload(localState, "mock-draft"),
          });
        }, 4500);
      },
      cancel() {
        channel.close();
        if (interval) {
          clearInterval(interval);
        }
      },
    });

    return createEventStreamResponse(stream);
  }

  async function streamSleeperDraftEvents(draftId: string, userRosterId: string | null): Promise<Response> {
    const channel = createEventStreamChannel();
    let localState = await loadDraftState(draftId, userRosterId);
    let lastPickCount = localState.picks.length;
    let consecutiveFailures = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        channel.send(controller, "snapshot", {
          type: "snapshot",
          ...toDraftPayload(localState, draftId),
        });

        scheduleRefresh(controller);
      },
      cancel() {
        cancelled = true;
        channel.close();
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
      },
    });

    return createEventStreamResponse(stream);

    function scheduleRefresh(
      controller: ReadableStreamDefaultController<Uint8Array>,
      delay = draftPollDelayMs(consecutiveFailures, localState.status),
    ) {
      if (cancelled) {
        return;
      }
      refreshTimer = setTimeout(() => {
        void refresh(controller);
      }, delay);
    }

    async function refresh(controller: ReadableStreamDefaultController<Uint8Array>) {
      let sent = false;
      try {
        const picks = await sleeperClient.getDraftPicks(draftId);
        consecutiveFailures = 0;
        const previousPickCount = lastPickCount;

        if (picks.length !== previousPickCount) {
          const nextState = await loadDraftState(draftId, userRosterId);
          localState = nextState;
          lastPickCount = nextState.picks.length;
          sent = channel.send(controller, "pick", {
            type: "pick",
            pick: nextState.picks[nextState.picks.length - 1],
            ...toDraftPayload(nextState, draftId, { recordTrigger: "pick-update", userRosterId }),
          });
        } else {
          sent = channel.send(controller, "heartbeat", {
            type: "heartbeat",
            at: new Date().toISOString(),
          });
        }
      } catch (error) {
        consecutiveFailures += 1;
        logRouteErrorMessage("draft event refresh", error);
        sent = channel.send(controller, "stream-error", {
          type: "stream-error",
          at: new Date().toISOString(),
          message: "Sleeper is temporarily unavailable. Automatic retry will continue.",
          consecutiveFailures,
          nextRetryMs: draftPollDelayMs(consecutiveFailures, localState.status),
        });
      } finally {
        if (sent) {
          scheduleRefresh(controller);
        }
      }
    }
  }
  function formatDraftPick(pickNo: number, teamCount: number): string {
    const round = Math.floor((pickNo - 1) / teamCount) + 1;
    const pickInRound = ((pickNo - 1) % teamCount) + 1;
    return `${round}.${String(pickInRound).padStart(2, "0")}`;
  }

  function createEventStreamResponse(stream: ReadableStream<Uint8Array>): Response {
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

}

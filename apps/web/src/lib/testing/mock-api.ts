import { vi } from "vitest";

import type {
  AdpImportPayload,
  AiDraftStrategyPayload,
  AppSettings,
  AskAnswerPayload,
  ConnectPayload,
  DecisionHistoryPayload,
  DiagnosticsPayload,
  DraftPayload,
  DraftRecommendation,
  DraftScoringFormat,
  DraftStrategyInstructionSource,
  DraftStrategyInstructionsPayload,
  DraftStrategyProposal,
  Position,
  RankingImportPayload,
  RecommendationPreferenceRequest,
  RosRankingImportPayload,
  SeasonProjectionImportPayload,
  TeamAskAnswerPayload,
  TeamPayload,
  WeeklyProjectionImportPayload,
} from "../types";
import { createAiProviderStatusFixture, createAppSettingsFixture, createDraftPayloadFixture, createTeamPayloadFixture } from "./draft-fixtures";
import { createDeferred, type Deferred } from "./deferred";
import { FakeEventSource } from "./fake-event-source";

type DraftStateRequest = {
  draftId: string;
  userRosterId: string | null;
  userIdentifier: string | null;
};

type RecommendationRequest = {
  draftId: string;
  userRosterId: string | null;
  recommendationPreferences: RecommendationPreferenceRequest;
};

function draftStateKey(request: DraftStateRequest) {
  return JSON.stringify(request);
}

function recommendationKey(request: RecommendationRequest) {
  return JSON.stringify(request);
}

function unexpected(name: string): never {
  throw new Error(`${name} should not be called in this test.`);
}

class ApiMockController {
  settings: AppSettings = createAppSettingsFixture();
  aiStatus = createAiProviderStatusFixture();
  decisionHistory: DecisionHistoryPayload = { snapshots: [] };
  draftStrategyInstructions: DraftStrategyInstructionsPayload = { instructions: [] };
  teamPayload: TeamPayload = createTeamPayloadFixture();
  readonly draftStateRequests: DraftStateRequest[] = [];
  readonly recommendationRequests: RecommendationRequest[] = [];
  readonly eventSources: FakeEventSource[] = [];
  private readonly draftStateDeferreds = new Map<string, Deferred<DraftPayload>[]>();
  private readonly recommendationDeferreds = new Map<string, Deferred<DraftRecommendation>[]>();

  readonly fetchSettings = vi.fn(async () => this.settings);
  readonly updateSettings = vi.fn(async (settings: Partial<AppSettings>) => {
    this.settings = { ...this.settings, ...settings };
    return this.settings;
  });
  readonly fetchAiStatus = vi.fn(async () => this.aiStatus);
  readonly fetchDraftState = vi.fn(async (
    draftId: string,
    userRosterId: string | null,
    userIdentifier: string | null = null,
  ) => {
    const request = { draftId, userRosterId, userIdentifier };
    this.draftStateRequests.push(request);
    const queue = this.draftStateDeferreds.get(draftStateKey(request));
    const deferred = queue?.shift();
    if (!deferred) {
      unexpected(`fetchDraftState(${draftId})`);
    }
    return await deferred.promise;
  });
  readonly fetchTeamManagerState = vi.fn(async () => this.teamPayload);
  readonly fetchDraftRecommendationRequest = vi.fn(async (
    draftId: string,
    userRosterId: string | null,
    recommendationPreferences: RecommendationPreferenceRequest,
  ) => {
    const request = { draftId, userRosterId, recommendationPreferences };
    this.recommendationRequests.push(request);
    const queue = this.recommendationDeferreds.get(recommendationKey(request));
    const deferred = queue?.shift();
    if (!deferred) {
      unexpected(`fetchDraftRecommendationRequest(${draftId})`);
    }
    return await deferred.promise;
  });
  readonly fetchDecisionHistory = vi.fn(async () => this.decisionHistory);
  readonly fetchDraftStrategyInstructions = vi.fn(async () => this.draftStrategyInstructions);
  readonly createDraftStrategyInstruction = vi.fn(async () => this.draftStrategyInstructions);
  readonly updateDraftStrategyInstruction = vi.fn(async () => this.draftStrategyInstructions);
  readonly deleteDraftStrategyInstruction = vi.fn(async () => this.draftStrategyInstructions);
  readonly createDraftEventSource = vi.fn((draftId: string, userRosterId: string | null) => {
    const source = new FakeEventSource(draftId, userRosterId);
    this.eventSources.push(source);
    return source as unknown as EventSource;
  });
  readonly fetchAiDraftStrategyRequest = vi.fn(async () => unexpected("fetchAiDraftStrategyRequest"));
  readonly fetchDiagnostics = vi.fn(async () => unexpected("fetchDiagnostics"));
  readonly fetchSleeperConnect = vi.fn(async () => unexpected("fetchSleeperConnect"));
  readonly importWeeklyProjectionFilesRequest = vi.fn<
    (input: {
      leagueId: string;
      season: string;
      week: number;
      files: Array<{ position: Position; csvText: string }>;
      userRosterId?: string | null;
      draftId?: string | null;
    }) => Promise<WeeklyProjectionImportPayload>
  >(async () => unexpected("importWeeklyProjectionFilesRequest"));
  readonly importAdpRequest = vi.fn<
    (input: {
      draftId: string;
      userRosterId: string | null;
      season: string;
      csvText: string;
    }) => Promise<AdpImportPayload>
  >(async () => unexpected("importAdpRequest"));
  readonly importRankingsRequest = vi.fn<
    (draftId: string, userRosterId: string | null, csvText: string, scoring: string) => Promise<RankingImportPayload>
  >(async () => unexpected("importRankingsRequest"));
  readonly importRosRankingsRequest = vi.fn<
    (input: {
      leagueId: string;
      season: string;
      scoring: DraftScoringFormat;
      csvText: string;
      userRosterId?: string | null;
      draftId?: string | null;
      week?: number | null;
    }) => Promise<RosRankingImportPayload>
  >(async () => unexpected("importRosRankingsRequest"));
  readonly importSeasonProjectionsRequest = vi.fn<
    (input: {
      draftId: string;
      userRosterId: string | null;
      season: string;
      files: Array<{ position: Position; csvText: string }>;
    }) => Promise<SeasonProjectionImportPayload>
  >(async () => unexpected("importSeasonProjectionsRequest"));
  readonly clearAdpRequest = vi.fn<(draftId: string, userRosterId: string | null) => Promise<DraftPayload>>(
    async () => unexpected("clearAdpRequest"),
  );
  readonly clearRankingsRequest = vi.fn<(draftId: string, userRosterId: string | null) => Promise<DraftPayload>>(
    async () => unexpected("clearRankingsRequest"),
  );
  readonly clearRosRankingsRequest = vi.fn<
    (leagueId: string, season: string, scoring: DraftScoringFormat) => Promise<{ deleted: boolean }>
  >(async () => unexpected("clearRosRankingsRequest"));
  readonly clearSeasonProjectionsRequest = vi.fn<(draftId: string, userRosterId: string | null) => Promise<DraftPayload>>(
    async () => unexpected("clearSeasonProjectionsRequest"),
  );
  readonly clearWeeklyProjectionsRequest = vi.fn<
    (leagueId: string, season: string, week: number) => Promise<{ deleted: boolean }>
  >(async () => unexpected("clearWeeklyProjectionsRequest"));
  readonly askManagerRequest = vi.fn<
    (
      draftId: string,
      userRosterId: string | null,
      question: string,
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
      userPreferences?: { pinned: string[]; faded: string[]; excluded: string[] },
      recommendationPreferences?: RecommendationPreferenceRequest,
    ) => Promise<AskAnswerPayload>
  >(async () => unexpected("askManagerRequest"));
  readonly askTeamManagerRequest = vi.fn<
    (
      leagueId: string,
      userRosterId: string | null,
      draftId: string | null,
      question: string,
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
      season?: string | null,
      week?: number | null,
    ) => Promise<TeamAskAnswerPayload>
  >(async () => unexpected("askTeamManagerRequest"));

  reset() {
    this.settings = createAppSettingsFixture();
    this.aiStatus = createAiProviderStatusFixture();
    this.decisionHistory = { snapshots: [] };
    this.draftStrategyInstructions = { instructions: [] };
    this.teamPayload = createTeamPayloadFixture();
    this.draftStateRequests.length = 0;
    this.recommendationRequests.length = 0;
    this.eventSources.length = 0;
    this.draftStateDeferreds.clear();
    this.recommendationDeferreds.clear();
    for (const mock of [
      this.fetchSettings,
      this.updateSettings,
      this.fetchAiStatus,
      this.fetchDraftState,
      this.fetchTeamManagerState,
      this.fetchDraftRecommendationRequest,
      this.fetchDecisionHistory,
      this.fetchDraftStrategyInstructions,
      this.createDraftStrategyInstruction,
      this.updateDraftStrategyInstruction,
      this.deleteDraftStrategyInstruction,
      this.createDraftEventSource,
      this.fetchAiDraftStrategyRequest,
      this.fetchDiagnostics,
      this.fetchSleeperConnect,
      this.importWeeklyProjectionFilesRequest,
      this.importAdpRequest,
      this.importRankingsRequest,
      this.importRosRankingsRequest,
      this.importSeasonProjectionsRequest,
      this.clearAdpRequest,
      this.clearRankingsRequest,
      this.clearRosRankingsRequest,
      this.clearSeasonProjectionsRequest,
      this.clearWeeklyProjectionsRequest,
      this.askManagerRequest,
      this.askTeamManagerRequest,
    ]) {
      mock.mockClear();
    }
  }

  deferDraftState(request: DraftStateRequest) {
    const deferred = createDeferred<DraftPayload>();
    const key = draftStateKey(request);
    const queue = this.draftStateDeferreds.get(key) ?? [];
    queue.push(deferred);
    this.draftStateDeferreds.set(key, queue);
    return deferred;
  }

  deferRecommendation(request: RecommendationRequest) {
    const deferred = createDeferred<DraftRecommendation>();
    const key = recommendationKey(request);
    const queue = this.recommendationDeferreds.get(key) ?? [];
    queue.push(deferred);
    this.recommendationDeferreds.set(key, queue);
    return deferred;
  }

  getOpenEventSources() {
    return this.eventSources.filter((source) => !source.closed);
  }
}

export const apiMock = new ApiMockController();

export const askManagerRequest = (...args: Parameters<typeof apiMock.askManagerRequest>) => apiMock.askManagerRequest(...args);
export const askTeamManagerRequest = (...args: Parameters<typeof apiMock.askTeamManagerRequest>) => apiMock.askTeamManagerRequest(...args);
export const clearAdpRequest = (...args: Parameters<typeof apiMock.clearAdpRequest>) => apiMock.clearAdpRequest(...args);
export const clearRankingsRequest = (...args: Parameters<typeof apiMock.clearRankingsRequest>) => apiMock.clearRankingsRequest(...args);
export const clearRosRankingsRequest = (...args: Parameters<typeof apiMock.clearRosRankingsRequest>) => apiMock.clearRosRankingsRequest(...args);
export const clearSeasonProjectionsRequest = (...args: Parameters<typeof apiMock.clearSeasonProjectionsRequest>) => apiMock.clearSeasonProjectionsRequest(...args);
export const clearWeeklyProjectionsRequest = (...args: Parameters<typeof apiMock.clearWeeklyProjectionsRequest>) => apiMock.clearWeeklyProjectionsRequest(...args);
export const createDraftEventSource = (...args: Parameters<typeof apiMock.createDraftEventSource>) => apiMock.createDraftEventSource(...args);
export const createDraftStrategyInstruction = (...args: Parameters<typeof apiMock.createDraftStrategyInstruction>) => apiMock.createDraftStrategyInstruction(...args);
export const deleteDraftStrategyInstruction = (...args: Parameters<typeof apiMock.deleteDraftStrategyInstruction>) => apiMock.deleteDraftStrategyInstruction(...args);
export const fetchAiDraftStrategyRequest = (...args: Parameters<typeof apiMock.fetchAiDraftStrategyRequest>) => apiMock.fetchAiDraftStrategyRequest(...args);
export const fetchAiStatus = (...args: Parameters<typeof apiMock.fetchAiStatus>) => apiMock.fetchAiStatus(...args);
export const fetchDecisionHistory = (...args: Parameters<typeof apiMock.fetchDecisionHistory>) => apiMock.fetchDecisionHistory(...args);
export const fetchDiagnostics = (...args: Parameters<typeof apiMock.fetchDiagnostics>) => apiMock.fetchDiagnostics(...args);
export const fetchDraftRecommendationRequest = (...args: Parameters<typeof apiMock.fetchDraftRecommendationRequest>) => apiMock.fetchDraftRecommendationRequest(...args);
export const fetchDraftState = (...args: Parameters<typeof apiMock.fetchDraftState>) => apiMock.fetchDraftState(...args);
export const fetchDraftStrategyInstructions = (...args: Parameters<typeof apiMock.fetchDraftStrategyInstructions>) => apiMock.fetchDraftStrategyInstructions(...args);
export const fetchSettings = (...args: Parameters<typeof apiMock.fetchSettings>) => apiMock.fetchSettings(...args);
export const fetchSleeperConnect = (...args: Parameters<typeof apiMock.fetchSleeperConnect>) => apiMock.fetchSleeperConnect(...args);
export const fetchTeamManagerState = (...args: Parameters<typeof apiMock.fetchTeamManagerState>) => apiMock.fetchTeamManagerState(...args);
export const importAdpRequest = (...args: Parameters<typeof apiMock.importAdpRequest>) => apiMock.importAdpRequest(...args);
export const importRankingsRequest = (...args: Parameters<typeof apiMock.importRankingsRequest>) => apiMock.importRankingsRequest(...args);
export const importRosRankingsRequest = (...args: Parameters<typeof apiMock.importRosRankingsRequest>) => apiMock.importRosRankingsRequest(...args);
export const importSeasonProjectionsRequest = (...args: Parameters<typeof apiMock.importSeasonProjectionsRequest>) => apiMock.importSeasonProjectionsRequest(...args);
export const importWeeklyProjectionFilesRequest = (...args: Parameters<typeof apiMock.importWeeklyProjectionFilesRequest>) => apiMock.importWeeklyProjectionFilesRequest(...args);
export const updateDraftStrategyInstruction = (...args: Parameters<typeof apiMock.updateDraftStrategyInstruction>) => apiMock.updateDraftStrategyInstruction(...args);
export const updateSettings = (...args: Parameters<typeof apiMock.updateSettings>) => apiMock.updateSettings(...args);

export type {
  AdpImportPayload,
  AiDraftStrategyPayload,
  AskAnswerPayload,
  ConnectPayload,
  DiagnosticsPayload,
  DraftRecommendation,
  DraftScoringFormat,
  DraftStrategyInstructionSource,
  DraftStrategyProposal,
  Position,
  RosRankingImportPayload,
  SeasonProjectionImportPayload,
  TeamAskAnswerPayload,
  WeeklyProjectionImportPayload,
};

export function createDraftPayloadForPreferences(
  draftId: string,
  name: string,
  recommendationPreferences: RecommendationPreferenceRequest,
) {
  return createDraftPayloadFixture({
    draftId,
    name,
    recommendationPreferences,
  }).recommendation;
}

import { serve } from "@hono/node-server";
import {
  advanceMockDraftState,
  buildDraftRecommendation,
  buildTeamNeedsSummary,
  createMockDraftState,
  type DraftRecommendationOptions,
} from "@sleeper-ai/engine";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";

import { RankingImportRequestSchema, type DraftRecommendation, type DraftState, type RankingImportSummary, type TeamManagerState, type TeamNeedsSummary } from "@sleeper-ai/shared";

import { buildDraftAiContext } from "./ai/context";
import { buildTeamAiContext } from "./ai/team-context";
import { ExperimentalCodexAuthClient, ExperimentalCodexTokenStore } from "./ai/experimental-codex-auth";
import { createAiProvider } from "./ai/provider-factory";
import { importFantasyProsCsv, RankingImportStore } from "./rankings-import";
import { getSleeperConnectOptions } from "./sleeper-connect";
import { SleeperApiError, SleeperClient } from "./sleeper";
import { SettingsStore } from "./settings-store";

export const app = new Hono();
const port = Number(process.env.PORT ?? 8787);
const sleeperClient = new SleeperClient();
const rankingImportStore = new RankingImportStore();
const settingsStore = new SettingsStore();
const experimentalCodexTokenStore = new ExperimentalCodexTokenStore();
const experimentalCodexAuthClient = new ExperimentalCodexAuthClient();
let pendingExperimentalCodexDeviceCode: { userCode: string; deviceAuthId: string; verificationUri: string; interval: number } | null = null;
let mockState = createMockDraftState(8);

type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
};

type TeamPayload = {
  state: TeamManagerState;
  needs: TeamNeedsSummary;
};

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "sleeper-ai-api",
    now: new Date().toISOString(),
  }),
);

app.get("/settings", (c) => c.json(settingsStore.get()));

app.put("/settings", async (c) => {
  try {
    return c.json(settingsStore.update(await c.req.json()));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/ai/status", (c) => c.json(createAiProvider(settingsStore.get(), experimentalCodexTokenStore).status()));

app.get("/ai/experimental-codex/status", (c) => {
  const pending = pendingExperimentalCodexDeviceCode;
  return c.json({
    authenticated: Boolean(experimentalCodexTokenStore.get()),
    verificationUri: pending?.verificationUri,
    userCode: pending?.userCode,
    deviceAuthId: pending?.deviceAuthId,
    interval: pending?.interval,
  });
});

app.post("/ai/experimental-codex/auth/start", async (c) => {
  try {
    pendingExperimentalCodexDeviceCode = await experimentalCodexAuthClient.requestDeviceCode();
    return c.json({ authenticated: false, ...pendingExperimentalCodexDeviceCode });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/ai/experimental-codex/auth/poll", async (c) => {
  try {
    const body = (await c.req.json<{ deviceAuthId?: string; userCode?: string }>().catch(() => ({}))) as {
      deviceAuthId?: string;
      userCode?: string;
    };
    const deviceAuthId = body.deviceAuthId ?? pendingExperimentalCodexDeviceCode?.deviceAuthId;
    const userCode = body.userCode ?? pendingExperimentalCodexDeviceCode?.userCode;
    if (!deviceAuthId || !userCode) {
      return c.json({ authenticated: false, pending: false, error: "Start Codex login first." }, 400);
    }

    const tokens = await experimentalCodexAuthClient.pollDeviceCode(deviceAuthId, userCode);
    if (!tokens) {
      return c.json({ authenticated: false, pending: true });
    }

    experimentalCodexTokenStore.set(tokens);
    pendingExperimentalCodexDeviceCode = null;
    return c.json({ authenticated: true, pending: false });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/ai/experimental-codex/logout", (c) => {
  experimentalCodexTokenStore.clear();
  pendingExperimentalCodexDeviceCode = null;
  return c.json({ authenticated: false });
});

app.get("/drafts/mock/state", (c) => {
  return c.json(toDraftPayload(rankingImportStore.apply("mock-draft", mockState), "mock-draft"));
});

app.get("/sleeper/connect", async (c) => {
  const username = c.req.query("username")?.trim();
  const season = c.req.query("season")?.trim() || null;
  const leagueId = c.req.query("leagueId")?.trim() || null;

  if (!username) {
    return c.json({ error: "Sleeper username or user ID is required." }, 400);
  }

  try {
    return c.json(await getSleeperConnectOptions(sleeperClient, username, season, leagueId));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/leagues/:leagueId/team", async (c) => {
  try {
    const state = await sleeperClient.getTeamManagerState(c.req.param("leagueId"), getUserRosterId(c));
    return c.json(toTeamPayload(state));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/leagues/:leagueId/team/ask", async (c) => {
  try {
    const body = await c.req
      .json<{ question?: string; conversationHistory?: Array<{ role?: string; content?: string }> }>()
      .catch(() => ({ question: "", conversationHistory: [] }));
    const question = body.question?.trim() ?? "";
    if (!question) {
      return c.json({ error: "Ask a team question before requesting AI advice." }, 400);
    }

    const state = await sleeperClient.getTeamManagerState(c.req.param("leagueId"), getUserRosterId(c));
    const aiProvider = createAiProvider(settingsStore.get(), experimentalCodexTokenStore);
    const aiAnswer = await aiProvider.answerTeamQuestion(
      buildTeamAiContext(state, question, normalizeConversationHistory(body.conversationHistory)),
    );

    return c.json({
      provider: aiAnswer.provider,
      question,
      answer: aiAnswer.answer,
      ...toTeamPayload(state),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});
app.get("/drafts/:draftId/state", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
    return c.json(toDraftPayload(state, c.req.param("draftId")));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/rankings/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = RankingImportRequestSchema.parse(await c.req.json());
    const storedImport = importFantasyProsCsv(state, body.csvText);
    rankingImportStore.set(draftId, storedImport);
    const importedState = rankingImportStore.apply(draftId, state);

    return c.json({
      summary: storedImport.summary,
      ...toDraftPayload(importedState, draftId),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/drafts/:draftId/rankings/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    rankingImportStore.delete(draftId);
    const state = await loadDraftState(draftId, getUserRosterId(c));
    return c.json(toDraftPayload(state, draftId));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/drafts/:draftId/recommendations", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
    return c.json(buildDraftRecommendation(state));
  } catch (error) {
    return handleRouteError(c, error);
  }
});
app.post("/drafts/:draftId/recommendations", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
    const body = (await c.req.json<{ recommendationPreferences?: DraftRecommendationOptions["preferences"] }>().catch(() => ({}))) as { recommendationPreferences?: DraftRecommendationOptions["preferences"] };
    return c.json(buildDraftRecommendation(state, { preferences: normalizeRecommendationPreferences(body.recommendationPreferences) }));
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
    const recommendation = buildDraftRecommendation(state, { preferences: normalizeRecommendationPreferences(body.recommendationPreferences) });
    const aiProvider = createAiProvider(settingsStore.get(), experimentalCodexTokenStore);
    const aiAnswer = await aiProvider.answerDraftQuestion(buildDraftAiContext(state, recommendation, question, conversationHistory, userPreferences));

    return c.json({
      provider: aiAnswer.provider,
      question,
      answer: aiAnswer.answer,
      recommendation,
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
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

async function loadDraftState(draftId: string, userRosterId?: string | null): Promise<DraftState> {
  if (isMockDraft(draftId)) {
    return rankingImportStore.apply(draftId, mockState);
  }

  const state = await sleeperClient.getDraftState(draftId, userRosterId);
  return rankingImportStore.apply(draftId, state);
}

function toTeamPayload(state: TeamManagerState): TeamPayload {
  return {
    state,
    needs: buildTeamNeedsSummary(state),
  };
}
function toDraftPayload(state: DraftState, draftId: string): DraftPayload {
  return {
    state,
    recommendation: buildDraftRecommendation(state),
    rankingImportSummary: rankingImportStore.get(draftId)?.summary ?? null,
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
function normalizeConversationHistory(history: Array<{ role?: string; content?: string }> | undefined) {
  return (history ?? [])
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content!.trim() }))
    .filter((message) => message.content.length > 0)
    .slice(-8);
}
function getUserRosterId(c: Context): string | null {
  return c.req.query("userRosterId") ?? null;
}

function isMockDraft(draftId: string): boolean {
  return draftId === "mock" || draftId === "mock-draft";
}

function logRouteError(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] ${c.req.method} ${c.req.path} failed: ${message}`);
}

function handleRouteError(c: Context, error: unknown) {
  logRouteError(c, error);

  if (error instanceof SleeperApiError) {
    const status = error.status === 404 ? 404 : 502;
    return c.json({ error: error.message }, status);
  }

  const message = error instanceof Error ? error.message : "Unknown server error.";
  return c.json({ error: message }, 500);
}

function streamMockDraftEvents(): Response {
  const encoder = new TextEncoder();
  let localState: DraftState = rankingImportStore.apply("mock-draft", mockState);
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send(controller, "snapshot", {
        type: "snapshot",
        ...toDraftPayload(localState, "mock-draft"),
      });

      interval = setInterval(() => {
        if (localState.status === "complete") {
          send(controller, "heartbeat", {
            type: "heartbeat",
            at: new Date().toISOString(),
          });
          return;
        }

        const previousPickCount = mockState.picks.length;
        mockState = advanceMockDraftState(mockState);
        localState = rankingImportStore.apply("mock-draft", mockState);
        const pick = localState.picks[previousPickCount];

        send(controller, "pick", {
          type: "pick",
          pick,
          ...toDraftPayload(localState, "mock-draft"),
        });
      }, 4500);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return createEventStreamResponse(stream);

  function send(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
    controller.enqueue(encoder.encode(`event: ${event}\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }
}

async function streamSleeperDraftEvents(draftId: string, userRosterId: string | null): Promise<Response> {
  const encoder = new TextEncoder();
  let localState = await loadDraftState(draftId, userRosterId);
  let lastPickCount = localState.picks.length;
  let consecutiveFailures = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send(controller, "snapshot", {
        type: "snapshot",
        ...toDraftPayload(localState, draftId),
      });

      interval = setInterval(() => {
        void refresh(controller);
      }, 5000);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return createEventStreamResponse(stream);

  async function refresh(controller: ReadableStreamDefaultController<Uint8Array>) {
    try {
      const nextState = await loadDraftState(draftId, userRosterId);
      consecutiveFailures = 0;
      const previousPickCount = lastPickCount;
      localState = nextState;
      lastPickCount = nextState.picks.length;

      if (nextState.picks.length > previousPickCount) {
        send(controller, "pick", {
          type: "pick",
          pick: nextState.picks[nextState.picks.length - 1],
          ...toDraftPayload(nextState, draftId),
        });
        return;
      }

      send(controller, "heartbeat", {
        type: "heartbeat",
        at: new Date().toISOString(),
      });
    } catch (error) {
      consecutiveFailures += 1;
      const message = error instanceof Error ? error.message : "Sleeper polling failed.";
      send(controller, "stream-error", {
        type: "stream-error",
        at: new Date().toISOString(),
        message,
        consecutiveFailures,
      });
    }
  }

  function send(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
    controller.enqueue(encoder.encode(`event: ${event}\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }
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

if (process.env.NODE_ENV !== "test") {
  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Sleeper AI API listening on http://localhost:${info.port}`);
    },
  );
}



















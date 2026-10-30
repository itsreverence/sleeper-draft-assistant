import type { AiRequestPhase, AiRequestProgress } from "./api";
import { carriedTakenOptions, type StrategyCall } from "./draft-room";
import { errorCopy } from "./error-copy";
import type { AiDraftStrategyPayload, DraftState } from "./types";

export type StrategyTarget = {
  draftId: string;
  // Preferences, guidance and settings the answer depends on. A change makes in-flight answers wrong rather than late.
  contextKey: string;
  revision: string;
  wanted: boolean;
};

type DraftStrategySessionOptions = {
  request: (automatic: boolean, progress: AiRequestProgress) => Promise<AiDraftStrategyPayload>;
  getState: () => DraftState | null;
  onCommitted?: () => void;
};

export function createDraftStrategySession({ request, getState, onCommitted }: DraftStrategySessionOptions) {
  let call: StrategyCall | null = $state(null);
  let error = $state("");
  let loading = $state(false);
  let phase: AiRequestPhase = $state("thinking");
  let target: StrategyTarget | null = null;
  let requestedRevision = "";
  let latestRequest = 0;
  let committedRequest = 0;
  let explicitRefresh = false;
  const controllers = new Set<AbortController>();

  function invalidate() {
    latestRequest += 1;
    committedRequest = latestRequest;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    loading = false;
  }

  function start({ draftId, revision }: StrategyTarget) {
    const requestId = ++latestRequest;
    const controller = new AbortController();
    const automatic = !explicitRefresh;
    explicitRefresh = false;
    controllers.add(controller);
    requestedRevision = revision;
    loading = true;
    phase = "thinking";
    error = "";
    void request(automatic, {
      signal: controller.signal,
      onPhase: (nextPhase) => {
        if (requestId === latestRequest) phase = nextPhase;
      },
    }).then((payload) => {
      if (requestId <= committedRequest) return;
      committedRequest = requestId;
      call = { draftId, revision, payload, carried: carriedTakenOptions(call, getState()) };
      onCommitted?.();
    }).catch((failure: unknown) => {
      if (requestId === latestRequest) error = failure instanceof Error ? failure.message : errorCopy.draftStrategy;
    }).finally(() => {
      controllers.delete(controller);
      if (requestId === latestRequest) loading = false;
    });
  }

  // A board change leaves earlier requests running: the provider cannot interrupt a turn, and its late answer beats an empty list.
  function sync(next: StrategyTarget) {
    if (target && (next.draftId !== target.draftId || next.contextKey !== target.contextKey)) {
      invalidate();
      error = "";
      requestedRevision = "";
      if (next.draftId !== target.draftId) call = null;
    }
    target = next;
    if (next.wanted && next.revision !== requestedRevision) start(next);
  }

  function retry() {
    if (!target) return;
    explicitRefresh = true;
    requestedRevision = "";
    sync(target);
  }

  function cancel() {
    invalidate();
    target = null;
    requestedRevision = "";
  }

  function reset() {
    cancel();
    call = null;
    error = "";
  }

  return {
    get call() { return call; },
    get error() { return error; },
    get loading() { return loading; },
    get phase() { return phase; },
    sync,
    retry,
    cancel,
    reset,
  };
}

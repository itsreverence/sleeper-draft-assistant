import { teamPayloadFingerprint } from "./team-refresh";

type TeamActivity = "load" | "refresh" | "import-ros" | "clear-ros" | "import-weekly" | "clear-weekly";

/** Owns request ordering across team loads, imports, clears, and session resets. */
export function createTeamSession() {
  let generation = 0;
  let activity = $state<TeamActivity | null>(null);
  let lastCheckedAt = $state<number | null>(null);
  let lastChangedAt = $state<number | null>(null);
  let fingerprint = "";

  return {
    get activity() { return activity; },
    get lastCheckedAt() { return lastCheckedAt; },
    get lastChangedAt() { return lastChangedAt; },
    reset() {
      generation += 1;
      activity = null;
      lastCheckedAt = null;
      lastChangedAt = null;
      fingerprint = "";
    },
    async run<T>(kind: TeamActivity, request: () => Promise<T>, handlers: {
      accept: (payload: T) => void | Promise<void>;
      reject: (error: unknown) => void;
    }): Promise<void> {
      const current = ++generation;
      activity = kind;
      try {
        const payload = await request();
        if (current !== generation) return;
        await handlers.accept(payload);
        if (current !== generation) return;
        if (kind === "load" || kind === "refresh") {
          const next = teamPayloadFingerprint(payload);
          const now = Date.now();
          if (fingerprint === "" || fingerprint !== next) lastChangedAt = now;
          fingerprint = next;
          lastCheckedAt = now;
        }
      } catch (error) {
        if (current === generation) handlers.reject(error);
      } finally {
        if (current === generation) activity = null;
      }
    },
  };
}

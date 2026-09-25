import { afterEach, expect, it, vi } from "vitest";
import { createTeamSession } from "./team-session.svelte";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

it("only accepts the latest context when loads finish out of order", async () => {
  const session = createTeamSession();
  const old = deferred<string>();
  const accept = vi.fn();
  const reject = vi.fn();
  const first = session.run("load", () => old.promise, { accept, reject });
  await session.run("load", async () => "new week", { accept, reject });
  old.resolve("old week");
  await first;
  expect(accept).toHaveBeenCalledExactlyOnceWith("new week");
  expect(session.activity).toBeNull();
});

it("does not mark a payload checked if applying it fails", async () => {
  const session = createTeamSession();
  const reject = vi.fn();
  const error = new Error("invalid payload");
  await session.run("load", async () => "payload", {
    accept: () => { throw error; },
    reject,
  });
  expect(reject).toHaveBeenCalledExactlyOnceWith(error);
  expect(session.lastCheckedAt).toBeNull();
  expect(session.activity).toBeNull();
});

it("ignores older refresh results and failures without clearing a newer import's busy state", async () => {
  const session = createTeamSession();
  const old = deferred<string>();
  const newer = deferred<string>();
  const accept = vi.fn();
  const reject = vi.fn();
  const first = session.run("refresh", () => old.promise, { accept, reject });
  const second = session.run("import-weekly", () => newer.promise, { accept, reject });
  old.reject(new Error("late failure"));
  await first;
  expect(reject).not.toHaveBeenCalled();
  expect(session.activity).toBe("import-weekly");
  newer.resolve("current");
  await second;
  expect(accept).toHaveBeenCalledExactlyOnceWith("current");
  expect(session.activity).toBeNull();
});

it.each(["import-weekly", "import-ros", "clear-weekly", "clear-ros", "load", "refresh"] as const)(
  "reset invalidates pending %s callbacks and freshness",
  async (kind) => {
    const session = createTeamSession();
    const pending = deferred<string>();
    const accept = vi.fn();
    const reject = vi.fn();
    const request = session.run(kind, () => pending.promise, { accept, reject });
    session.reset();
    pending.resolve("old context");
    await request;
    expect(accept).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect(session.activity).toBeNull();
    expect(session.lastCheckedAt).toBeNull();
    expect(session.lastChangedAt).toBeNull();
  },
);

it("tracks successful checks separately from changes and preserves freshness on failure", async () => {
  const session = createTeamSession();
  const accept = vi.fn();
  const reject = vi.fn();
  const clock = vi.spyOn(Date, "now").mockReturnValue(100);
  await session.run("load", async () => ({ roster: 1, updatedAt: "a" }), { accept, reject });
  clock.mockReturnValue(200);
  await session.run("refresh", async () => ({ roster: 1, updatedAt: "b" }), { accept, reject });
  expect(session.lastCheckedAt).toBe(200);
  expect(session.lastChangedAt).toBe(100);
  await session.run("refresh", async () => { throw new Error("offline"); }, { accept, reject });
  expect(reject).toHaveBeenCalledOnce();
  expect(session.lastCheckedAt).toBe(200);
  expect(session.activity).toBeNull();
  clock.mockReturnValue(300);
  await session.run("refresh", async () => ({ roster: 2 }), { accept, reject });
  expect(session.lastChangedAt).toBe(300);
});

it("allows clear to hand off to a reload without the clear finalizer ending that reload", async () => {
  const session = createTeamSession();
  const next = deferred<string>();
  const reject = vi.fn();
  let reload!: Promise<void>;
  await session.run("clear-ros", async () => undefined, {
    accept: () => { reload = session.run("load", () => next.promise, { accept: vi.fn(), reject }); },
    reject,
  });
  expect(session.activity).toBe("load");
  next.resolve("new roster");
  await reload;
  expect(session.activity).toBeNull();
});

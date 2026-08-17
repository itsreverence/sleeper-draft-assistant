# Plan 001: Harden Sleeper and Codex process boundaries

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report; do not improvise. When done, update
> this plan's row in `plans/README.md` unless a reviewer owns the index.
>
> **Drift check (run first)**:
> `git diff --stat b097275..HEAD -- apps/api/src/sleeper.ts apps/api/src/sleeper.test.ts apps/api/src/ai/codex-app-server-provider.ts apps/api/src/ai/codex-app-server-provider.test.ts`
> If these files changed, compare the excerpts below with live code before work.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b097275`, 2026-08-12

## Why this matters

Live draft refresh depends on bounded Sleeper I/O, and AI turns depend on a
Codex subprocess that cannot deadlock on an unread pipe. Today the Sleeper timer
is cleared before successful response-body parsing settles, while Codex stderr
is piped but never consumed. Both are narrow boundary defects that can be fixed
without changing recommendation behavior or application architecture.

## Current state

- `apps/api/src/sleeper.ts:365-400` returns the JSON promise without awaiting it:

  ```ts
  } else {
    return response.json() as Promise<T>;
  }
  // finally clears the timeout immediately
  ```

- `apps/api/src/ai/codex-app-server-provider.ts:251-255` launches Codex with
  `stdio: ["pipe", "pipe", "pipe"]`, but `attach()` at lines 368-377 consumes
  only `proc.stdout`.
- Follow the Vitest mocking style in `apps/api/src/sleeper.test.ts:1-31` and the
  provider lifecycle style in
  `apps/api/src/ai/codex-app-server-provider.test.ts:127-169`.
- `docs/ARCHITECTURE.md` requires generic upstream-safe renderer errors and a
  backend-owned provider process. Do not expose raw stderr or upstream bodies.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Focused API tests | `npm test -w @sleeper-draft-assistant/api -- sleeper.test.ts codex-app-server-provider.test.ts` | all selected tests pass |
| Typecheck | `npm run check -w @sleeper-draft-assistant/api` | exit 0, no errors |
| Canonical gates | `npm run check && npm test && npm run build` | exit 0 |

## Scope

**In scope**:

- `apps/api/src/sleeper.ts`
- `apps/api/src/sleeper.test.ts`
- `apps/api/src/ai/codex-app-server-provider.ts`
- `apps/api/src/ai/codex-app-server-provider.test.ts`

**Out of scope**:

- Retry counts, polling cadence, and SSE event shapes
- Codex protocol, thread reuse, tool definitions, or executable allowlisting
- Logging raw stderr, prompts, league data, local paths, or provider output
- Renderer or persistence refactors

## Git workflow

- Suggested branch: `advisor/001-harden-provider-boundaries`
- Use focused imperative commits matching recent repository history.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Characterize response-body failures

In `sleeper.test.ts`, add tests proving that a successful HTTP response whose
`json()` rejects remains inside the retry/error-translation boundary. Add a
fake-timer test where body parsing waits until the request timeout aborts. The
final public error must be `SleeperApiError`, not a raw `SyntaxError`.

**Verify**: run the focused test before the fix and record that the new tests
fail for the expected reason, then continue.

### Step 2: Keep parsing under the Sleeper timeout

Await `response.json()` inside the existing `try`. Preserve retry behavior for
retryable failures and status handling for non-retryable HTTP responses. Ensure
timeout, body-read, and parse failures exit as bounded `SleeperApiError`s without
including the upstream body or URL-sensitive details in client responses.

**Verify**: `npm test -w @sleeper-draft-assistant/api -- sleeper.test.ts` → all pass.

### Step 3: Drain Codex stderr safely

Continuously consume stderr or set it to `ignore`. Prefer draining into no
persistent buffer unless a bounded redacted diagnostic is already required by
an existing interface. Never forward raw stderr to API responses or support
reports. Make child-stream cleanup explicit when the process exits.

Add a test fixture or injectable spawn seam that writes more than a normal OS
pipe buffer to stderr while completing the stdout protocol. The test must finish
under a bounded timeout.

**Verify**:
`npm test -w @sleeper-draft-assistant/api -- codex-app-server-provider.test.ts`
→ all pass without hanging.

### Step 4: Run complete validation

Run the canonical gates and `git diff --check`.

**Verify**: `npm run check && npm test && npm run build && git diff --check` → exit 0.

## Test plan

- Successful response whose JSON body rejects
- Successful response whose body stalls past timeout
- Retry exhaustion produces `SleeperApiError`
- Codex child emits a large stderr stream and still completes stdout handling
- Existing retry, thread-reuse, and failed-turn restart tests remain unchanged

## Done criteria

- [ ] Successful Sleeper bodies are awaited before timeout cleanup.
- [ ] Body read/parse failures cannot escape as raw `SyntaxError`.
- [ ] Codex stderr cannot fill an unread pipe.
- [ ] No raw upstream/provider diagnostics reach clients.
- [ ] Canonical gates and `git diff --check` pass.
- [ ] Only in-scope source/test files plus `plans/README.md` changed.

## STOP conditions

- Fixing stderr requires changing Codex transport or shell invocation.
- Tests require real Sleeper or Codex network/account access.
- Error translation would expose upstream response bodies or local paths.
- In-scope code drift invalidates the described control flow.

## Maintenance notes

Keep response acquisition and body consumption inside the same timeout boundary
for future HTTP clients. Any future stderr diagnostics must be bounded and pass
the repository's redaction rules.


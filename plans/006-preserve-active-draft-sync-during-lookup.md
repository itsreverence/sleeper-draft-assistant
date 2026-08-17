# Plan 006: Preserve active draft sync while looking up leagues

> **Executor instructions**: Apply this only after the approved plan-003 commit
> chain through `146868e`. Follow each step, run every verification command, and
> stop on any scope expansion. Update the plan index unless a reviewer tells you
> that they maintain it.
>
> **Drift check (run first)**:
> `git diff --stat 146868e..HEAD -- apps/web/src/App.svelte apps/web/src/App.test.ts apps/web/src/lib/testing/mock-api.ts apps/web/src/lib/testing/draft-fixtures.ts`
> If these files drifted, compare the current code with the excerpts below and
> STOP if the lookup/session ownership changed materially.

## Status

- **Execution**: DONE — reviewer-approved at `aaec003`; focused regression,
  canonical gates, dependency audit, diff hygiene, and real-draft stream-count
  smoke passed on 2026-08-12
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: the implemented plan-003 commit chain through `146868e`
- **Category**: bug
- **Planned at**: commit `146868e`, 2026-08-12

## Why this matters

The real-draft smoke reproduced a silent live-sync failure. Looking up leagues
from the draft switcher closes the active EventSource before the read-only lookup,
then closing the drawer leaves the old draft visible with no stream, degraded
status, or reconnect affordance. During a live draft this can make a stale board
look current. League discovery must not interrupt the active draft; actual draft
activation already owns stream replacement.

## Current state

- `apps/web/src/App.svelte:514-564` owns account/league discovery. It currently
  calls `draftSession.disconnect()` before `fetchSleeperConnect`, even when a real
  draft remains active:

  ```ts
  async function findSleeperLeagues() {
    const username = usernameInput.trim();
    if (!username) return;

    draftSession.disconnect();
    if (isDemoDraftActive) {
      clearActiveDraft();
    }
    // read-only lookup follows
  }
  ```

- `apps/web/src/lib/draft-session.svelte.ts:386-397` already gives activation
  and explicit reconnect ownership of stream replacement. `disconnect()` closes
  the stream and resets sync tracking, so the UI has no degraded signal:

  ```ts
  function reconnect() {
    if (!activeDraftId) return;
    connectStream(activeDraftId, activeDraftTeamRef);
  }

  function disconnect() {
    closeEventSource();
    invalidateLifecycle(true);
    resetDraftSyncTracking();
  }
  ```

- `apps/web/src/lib/components/DraftSwitcherDrawer.svelte:106-123` disables the
  current known-draft button. A user who closes the drawer after lookup cannot
  reselect the current draft to restore its stream.
- Real smoke evidence: one active EventSource before Find leagues; zero after
  lookup and drawer close; the draft room stayed visible; no reconnect control
  or sync warning appeared.
- Existing renderer tests use `FakeEventSource` and `apiMock` in
  `apps/web/src/App.test.ts`; match that style and assert close counts and queued
  payload behavior, not just visible text.
- Preserve documented architecture: Sleeper access stays read-only, the latest
  snapshot remains authoritative, and activation—not discovery—owns switching.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `npm test -w @sleeper-draft-assistant/web -- App` | all App tests pass |
| Web check | `npm run check -w @sleeper-draft-assistant/web` | exit 0, no diagnostics |
| Web tests | `npm test -w @sleeper-draft-assistant/web` | all pass |
| Canonical gates | `npm run check && npm test && npm run build` | exit 0 |
| Dependency audit | `npm audit` | zero vulnerabilities |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `apps/web/src/App.svelte`
- `apps/web/src/App.test.ts`
- `apps/web/src/lib/testing/mock-api.ts` only if a typed discovery fixture is needed
- `apps/web/src/lib/testing/draft-fixtures.ts` only if a reusable synthetic connect fixture is needed

**Out of scope**:

- API routes, Sleeper polling protocol, EventSource URL/authentication, or shared response schemas
- UI redesign or enabling the current known-draft button
- Persistence, import, provider, Team Manager, or desktop changes
- Removing `draftSession.disconnect()` or changing its tested semantics; this plan fixes the inappropriate caller

## Git workflow

- Suggested branch: `advisor/006-preserve-draft-sync`
- One commit, matching the repository's imperative style, for example
  `Preserve draft sync during league lookup`.
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Reproduce the silent disconnect in the renderer harness

Add an `App.test.ts` regression that activates one synthetic real draft and
captures its `FakeEventSource`. Open the switcher, perform Find leagues using a
synthetic `fetchSleeperConnect` result, then close the switcher without opening a
different draft. Assert all of the following on the unmodified implementation:

- the active source receives one `close()` call (the characterization failure);
- no replacement source exists;
- the same draft remains rendered;
- there is no reconnect control.

Then state the corrected assertions the test will keep: the source is not closed,
exactly one source remains open, and an event emitted by it still updates current
draft state. Do not use real usernames, leagues, IDs, or network access in tests.

**Verify before the fix**: `npm test -w @sleeper-draft-assistant/web -- App` →
the new regression fails only on the EventSource ownership assertion.

### Step 2: Keep discovery separate from draft-session teardown

In `findSleeperLeagues`, do not disconnect an active real draft merely to run
the read-only account lookup. Keep the demo behavior explicit: a demo may still
be cleared before discovering real leagues. Do not add an automatic reconnect or
timer; the existing stream should simply remain owned by the current session.

Actual activation of another draft must continue to call `draftSession.activate`,
which closes/replaces the prior stream and applies epoch plus identity guards.

**Verify**: `npm test -w @sleeper-draft-assistant/web -- App` → all pass and the
new test observes one continuously open source after lookup/drawer close.

### Step 3: Cover lookup failure and actual switching

Extend the regression coverage so both discovery outcomes preserve sync:

- successful lookup followed by drawer close keeps the source;
- rejected lookup followed by drawer close keeps the source and surfaces the
  existing lookup error without disturbing draft state;
- lookup followed by activation of a different draft still closes the old source
  exactly once and leaves exactly one new source open.

Reuse plan-002 deferred fixtures; do not add browser automation to the unit suite.

**Verify**: `npm test -w @sleeper-draft-assistant/web` → all tests pass.

### Step 4: Re-run gates and the exact smoke path

Run the canonical commands. Then launch the reviewed build with disposable local
data and synthetic identifiers, activate a draft, open the switcher, run Find
leagues, close the drawer, and confirm one EventSource remains active. Repeat by
opening another draft and confirm the old source closes once and one new source
remains. Record counts only; do not record tokens, usernames, league names, draft
IDs, or imported values.

**Verify**: all commands in the table pass; manual evidence records active stream
count `1` after lookup/close and after a real switch.

## Test plan

- Active draft + successful discovery + drawer close preserves the same source.
- Active draft + failed discovery + drawer close preserves the same source.
- Discovery + different-draft activation replaces rather than duplicates streams.
- A post-lookup event from the preserved source still commits to the active draft.
- Existing activation, teardown, preference, import, and ask-race tests remain green.

## Done criteria

- [ ] Find leagues cannot close the EventSource of a retained real draft.
- [ ] Closing the switcher after successful or failed lookup leaves one active stream.
- [ ] Activating a different draft still closes the old source exactly once and opens one replacement.
- [ ] The focused regression proves the preserved source still applies events.
- [ ] Web and canonical gates, `npm audit`, and `git diff --check` pass.
- [ ] Exact manual smoke records stream counts without private data.
- [ ] No files outside Scope are modified.

## STOP conditions

- Fixing lookup requires changing the API, SSE protocol, or authentication URL.
- The active draft must be torn down for a documented security or data-integrity reason.
- A second stream owner or background reconnection loop appears necessary.
- The fix requires enabling the current draft button or redesigning the switcher.
- Existing activation tests show that a different draft no longer replaces the stream.

## Maintenance notes

Discovery and activation are separate lifecycles: discovery may update available
choices while the current draft remains live; activation owns epoch changes and
stream replacement. Future switcher work should test both “browse then cancel”
and “browse then switch” so a visible board is never silently stale.

# Plan 003: Give the active draft lifecycle one explicit owner

> **Executor instructions**: Complete plan 002 first. Preserve visible behavior
> except for the reproduced stale-response and no-provider defects. Run every
> verification command and stop on scope expansion. Update the plan index.
>
> **Drift check (run first)**:
> `git diff --stat b097275..HEAD -- apps/web/src/App.svelte apps/web/src/lib/api.ts apps/web/src/lib/types.ts apps/web/src/lib/components/RecommendationPanel.svelte apps/web/src/lib/components/TeamAskPanel.svelte packages/shared/src/index.ts apps/api/src/ai/types.ts apps/api/src/ai/noop-provider.ts`

## Status

- **Execution**: DONE — implementation reviewer-approved at commits `8738de2`,
  `c744568`, `a0e557a`, and `146868e`; real-draft acceptance passed after the
  narrow plan-006 fix at `aaec003`
- **Synthetic smoke evidence (2026-08-12)**: launched the reviewed branch with
  a fresh disposable data directory and browser profile; verified the empty
  landing state, demo activation, no-provider AI controls, mock SSE progression
  through draft completion, current-draft switcher re-entry, settings save, and
  no visible application errors. Real-draft preparation, limited-data entry,
  imported-ECR return behavior, and Windows packaging were not exercised.
- **Real smoke evidence (2026-08-12)**: with a fresh disposable profile, the
  real draft opened preparation, required an explicit AI choice, disabled normal
  entry at 0/3 sources, entered limited-data/no-AI mode with a visible warning,
  persisted that choice across reload, exposed Manage draft data, and retained
  exactly one active EventSource across reload. Failure: running Find leagues in
  the switcher closed that EventSource; closing the drawer left the visible draft
  with zero streams and no reconnect indicator. No private identifiers or league
  data are recorded here.
- **Acceptance closeout (2026-08-12)**: after plan 006, the previously failing
  lookup/cancel path retained one active EventSource before, during, and after
  discovery. A separate activation smoke closed the prior source once and left
  exactly one replacement source. No visible errors or private identifiers were
  recorded. Windows packaging and fresh-ECR import behavior remain unverified.
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-characterize-renderer-draft-lifecycle.md`
- **Category**: bug / tech-debt
- **Planned at**: commit `b097275`, 2026-08-12

## Why this matters

Draft activation, preferences, recommendations, and SSE currently share mutable
root state but do not share one stale-response policy. This plan introduces one
small draft-session owner with epoch plus identity checks. It does not create
controllers for the rest of the application and does not redesign the UI.

## Current state

- `App.svelte:110-194` declares 80+ mutable fields spanning unrelated domains.
- `loadDraft` at lines 673-793 commits after an await without checking whether a
  newer activation started.
- `refreshRecommendationWithPreferences` at lines 285-299 writes globally without
  captured draft identity or preference revision.
- `connectEvents` at lines 994-1041 directly owns stream replacement.
- Team Manager already demonstrates the local last-request-wins convention via
  `teamManagerRequestId` at lines 820 and 838-875.
- Architecture constraints: latest Sleeper snapshot stays authoritative,
  structured strategy results are pick-tagged, and stale responses are discarded
  (`docs/ARCHITECTURE.md:56-60`).

## Target seam

Create one rune-capable module, preferably
`apps/web/src/lib/draft-session.svelte.ts`, exporting a factory or small class.
It owns only:

- active and pending draft identity;
- activation epoch;
- recommendation/preference revision;
- the active EventSource and sync metadata;
- draft state, recommendation, and three draft import summaries;
- `activate`, `disconnect`, `reconnect`, `applyPreferences`, and `destroy`.

It must not own settings, connection lookup, Team Manager, dialogs, preparation
presentation, import file selection, or AI conversation messages.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -w @sleeper-draft-assistant/web -- draft-session` | all session tests pass |
| All web tests | `npm test -w @sleeper-draft-assistant/web` | all pass |
| Web check | `npm run check -w @sleeper-draft-assistant/web` | exit 0 |
| Canonical gates | `npm run check && npm test && npm run build` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/App.svelte`
- New `apps/web/src/lib/draft-session.svelte.ts`
- New `apps/web/src/lib/draft-session.test.ts` or plan-002 integration tests
- `apps/web/src/lib/api.ts` only to accept optional `AbortSignal`
- `apps/web/src/lib/components/TeamAskPanel.svelte`
- Shared/API provider-status types only if required for the explicit status state

**Out of scope**:

- Extracting connection, settings, import, or Team Manager controllers
- Rewriting component hierarchy or styling
- API route extraction, persistence changes, SSE protocol changes
- Removing deterministic evidence ordering or feasibility validation
- Enabling direct Codex backends or changing provider credentials

## Git workflow

- Suggested branch: `advisor/003-active-draft-session`
- Commit the no-provider semantic correction separately from session extraction.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Model provider availability explicitly

First use the plan-002 provider fixture to add the desired noop-disabled
assertion and confirm it fails for the current `configured: true` behavior.
Then implement the semantic correction.

Replace the overloaded readiness interpretation with a discriminated state such
as `disabled | available | unavailable`. Keep any one-request error separate from
availability. Map noop to `disabled`. Update both draft and Team Manager controls
to use the same predicate. Keep the backend noop implementation narrow; do not
surface it as conversational AI or a parallel strategist.

**Verify**: plan-002 no-provider test and existing provider tests pass.

### Step 2: Introduce the draft-session module behind dependency injection

Inject state fetch, recommendation fetch, EventSource creation, time, and storage
operations so unit tests require no globals. Use a monotonically increasing
activation epoch plus requested draft identity. During activation compare against
the pending target; after activation compare against the active identity.

Do not pass a giant application-services object. Each dependency should be a
specific function used by this session.

**Verify**: `npm run check -w @sleeper-draft-assistant/web` → exit 0.

### Step 3: Make activation last-request-wins

First add the reverse-order activation regression using plan 002's deferred
request fixture and confirm it fails because draft A overwrites draft B. Then
implement the guarded activation.

Every commit after an await must verify both activation epoch and requested
identity. Abort the prior fetch when practical, but correctness must depend on
the checks rather than successful cancellation. Only the winning activation may
write localStorage, start Team Manager loading through a narrow callback, load
history, or install the EventSource.

**Verify**: reverse-order activation test passes; assert only one stream remains.

### Step 4: Make preference recommendations revision-safe

First add reverse-order same-draft and delayed previous-draft tests with plan
002's recommendation fixture. Confirm both fail for the expected unconditional
global write before changing production code.

Capture active draft ID, team reference, activation epoch, and preference
revision. Commit only when all still match. Remove the duplicate refresh caused
by applying a payload before loading the new draft's stored preferences. A stale
response must have no effect on recommendation or history loading.

**Verify**: both reverse-order and cross-draft preference tests pass.

### Step 5: Move stream ownership and sync metadata

Move `connectEvents`, reconnect behavior, handler installation, stream closure,
and sync timestamps into the session. Reject events whose session identity no
longer matches even if a closed EventSource dispatches a queued callback.

**Verify**: EventSource replacement/cleanup tests pass.

### Step 6: Reduce `App.svelte` to composition for this domain

Remove the migrated draft lifecycle fields/functions. `App.svelte` may read
session state and invoke session methods, but must not directly create an
EventSource or write recommendation responses. Do not extract other domains.

**Verify**:

```bash
rg -n 'new EventSource|createDraftEventSource|eventSource\s*=' apps/web/src/App.svelte
```

→ no matches, followed by all canonical gates passing.

### Step 7: Perform draft smoke tests

Run the demo and real-draft preparation checks in `docs/WORKFLOW.md:10-21`.
Verify reconnect, switching between two drafts, rapid preference changes, limited
data entry, and configured/no-AI states. Use only synthetic data in evidence.

**Verify**: record each check and observed result in the PR/change handoff.

## Test plan

- Reverse-order A→B activation and cross-session queued SSE event
- Same-draft reconnect replaces and closes the stream
- Reverse-order preferences and previous-draft delayed recommendation
- Destroy closes the active stream and invalidates all epochs
- Noop/disabled provider prevents draft and Team Manager AI submission
- Existing preparation, AI pick-staleness, and Team Manager refresh tests pass

## Done criteria

- [ ] `App.svelte` no longer owns draft request or SSE lifecycle.
- [ ] All asynchronous draft commits check epoch and identity.
- [ ] Recommendation commits additionally check preference revision.
- [ ] Noop is explicitly disabled and cannot render as conversational AI.
- [ ] No unrelated controller/store abstractions were introduced.
- [ ] Canonical gates and documented draft smoke tests pass.
- [ ] Windows claims are supported only by actual Windows evidence.

## STOP conditions

- The extraction requires changing API/SSE response shapes.
- More than the named draft lifecycle must move to make the module compile.
- Svelte reactivity requires a broad component rewrite.
- A characterization test contradicts documented product behavior.
- Any trust-boundary control would be weakened.

## Maintenance notes

All future draft-scoped async work must enter through this session or carry its
epoch and identity. Do not automatically create parallel controllers for other
domains; reassess them independently after this change is stable in a live draft.

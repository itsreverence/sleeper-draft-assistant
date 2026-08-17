# Plan 002: Establish renderer draft-lifecycle characterization tests

> **Executor instructions**: Follow this plan step by step. This is a test-only
> characterization plan; do not fix product behavior here. Run every verification
> command. Stop rather than expanding scope. Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat b097275..HEAD -- apps/web/package.json package-lock.json apps/web/vite.config.ts apps/web/src/App.svelte apps/web/src/lib/components/TeamAskPanel.svelte apps/web/src/lib/components/DraftSwitcherDrawer.svelte`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b097275`, 2026-08-12

## Why this matters

The renderer's highest-risk behavior lives in `App.svelte`, but all existing web
tests exercise extracted TypeScript helpers. Before moving draft ownership, the
suite needs to prove activation ordering, preference ordering, EventSource
replacement, and provider-disabled rendering. These tests define behavior; they
must not smuggle an architectural rewrite into the harness change.

## Current state

- `apps/web/src/App.svelte:673-748` loads and commits a draft without an epoch.
- `apps/web/src/App.svelte:285-299` writes recommendation responses without an
  identity or revision check.
- `apps/web/src/App.svelte:994-1041` owns EventSource creation and handlers.
- `apps/web/src/lib/components/TeamAskPanel.svelte:34-35` treats any status with
  `configured: true` as ready, while draft chat requires `codex-app-server`.
- `apps/web/package.json` has Vitest but no DOM/component testing environment.
- Match the direct Vitest assertion style in `apps/web/src/lib/ai-panel.test.ts`
  and `apps/web/src/lib/team-refresh.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Web tests | `npm test -w @sleeper-draft-assistant/web` | all tests pass |
| Web check | `npm run check -w @sleeper-draft-assistant/web` | exit 0 |
| Canonical gates | `npm run check && npm test && npm run build` | exit 0 after characterization strategy is finalized |

## Scope

**In scope**:

- `apps/web/package.json`
- `package-lock.json`
- `apps/web/vite.config.ts` only if test-environment configuration is required
- New files under `apps/web/src/lib/testing/`
- New `*.test.ts` or `*.test.svelte.ts` renderer tests
- Minimal exported test seams from `App.svelte` only if mounting cannot observe
  the behavior; prefer public UI behavior

**Out of scope**:

- Fixing races or extracting a session module
- Changing UI copy, layouts, provider schemas, API response shapes, or SSE format
- Browser E2E infrastructure larger than the four named behaviors
- Production dependencies; test tools must be dev dependencies

## Git workflow

- Suggested branch: `advisor/002-renderer-lifecycle-tests`
- Keep the harness commit separate from characterization cases.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the smallest Svelte component test environment

Use a Svelte 5-compatible component testing library and a DOM environment under
Vitest. Add deterministic mocks for the API module, localStorage, and EventSource.
The EventSource fake must expose listeners, emitted events, and `close()` calls.

**Verify**: add one trivial mounted-component test; run
`npm test -w @sleeper-draft-assistant/web` → existing tests plus the smoke test pass.

### Step 2: Establish the provider-state component fixture

Mount `TeamAskPanel` with a configured Codex status and prove the fixture can
observe its label, input, suggested questions, and submit callback. Add a reusable
factory for provider status variants, including noop, but do not assert the
desired noop behavior in this harness-only plan.

**Verify**: the configured-provider component test passes.

### Step 3: Establish controllable draft-activation requests

Mount the smallest observable root workflow with deferred API promises. Prove one
activation can be held, resolved, rendered, persisted, and connected to exactly
one fake EventSource. Expose helpers that can start two requests and resolve them
in either order, but leave the reverse-order regression assertion to plan 003.

**Verify**: the single-activation fixture test passes with no real network.

### Step 4: Establish controllable recommendation requests

Use the mounted workflow and deferred API mock to issue one preference change,
resolve its recommendation, and observe the updated recommendation. Ensure the
fixture can identify requests by draft ID and supplied preference without
depending on call-array indexes.

**Verify**: the single-request test passes without unhandled promises or timers.

### Step 5: Characterize EventSource replacement and cleanup

Assert activation closes the prior stream, reconnect replaces rather than adds a
stream, and component destruction closes the active stream. Keep existing SSE
event names and payloads unchanged.

**Verify**: cleanup assertions pass or fail deterministically; no test hangs.

## Test plan

The plan itself is the harness test plan. Name tests by behavior, not implementation:

- configured provider submits a Team Manager question
- one draft activation commits state, storage, and one EventSource
- one preference update commits its recommendation
- exactly one EventSource owns the active session and is closed on teardown

Plan 003 must use these fixtures to add the four failing regressions immediately
before their fixes: disabled noop provider, reverse-order activation,
reverse-order preferences, and cross-draft recommendation isolation.

## Done criteria

- [ ] Component tests run in one documented command.
- [ ] API, localStorage, and EventSource fakes make no real external calls.
- [ ] Provider, activation, recommendation, and EventSource fixtures are reusable
      by plan 003 without production-only globals.
- [ ] No failing, skipped, or todo regression tests are left behind.
- [ ] No production behavior was changed in the harness commit.

## STOP conditions

- The chosen harness requires changing production bundling or CSP.
- Mounting `App.svelte` requires real Sleeper/Codex access.
- A test can pass only through arbitrary sleeps or order-dependent global state.
- More than minimal test seams must be exported from production code.

## Maintenance notes

Keep these tests focused on lifecycle contracts. Pure formatting, evidence, and
draft-board calculations should remain in fast helper/unit tests.

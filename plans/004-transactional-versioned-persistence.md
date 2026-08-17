# Plan 004: Make persistence and reset durable, atomic, and version-aware

> **Executor instructions**: This is post-draft work. Do not rush it before a
> live draft. Follow every step and use failure injection; success-only tests are
> insufficient. Stop on any migration ambiguity. Update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b097275..HEAD -- apps/api/src/sqlite-app-database.ts apps/api/src/sqlite-app-database.test.ts apps/api/src/index.ts apps/api/src/data-management-routes.test.ts apps/api/src/settings-store.ts apps/api/src/decision-log-store.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 001–003
- **Category**: bug / perf / migration
- **Planned at**: commit `b097275`, 2026-08-12

## Why this matters

Each sql.js mutation currently rewrites the full database, and a failed durable
write leaves the live in-memory database ahead of disk. Reset performs many such
writes and cannot invalidate an AI request that began before deletion. Stored
JSON also lacks domain codecs and versions, making future upgrades unsafe.

## Current state

- `sqlite-app-database.ts:79-113` mutates the live DB then calls `persist()`.
- `sqlite-app-database.ts:215-218` exports and atomically replaces the file, but
  mutation methods have no rollback/reload path when replacement fails.
- `decision-log-store.ts:81-90` performs insert/export then prune/export.
- `index.ts:151-167` clears eight stores and settings sequentially.
- `index.ts:711-782` may persist an AI plan and snapshot after a reset occurring
  during the awaited provider turn.
- `sqlite-app-database.ts:36-64` parses JSON with unchecked casts; settings alone
  has a one-off runtime migration in `settings-store.ts:42-77`.
- `secure-file.ts:37-70` is the exemplar for atomic owner-private file replacement;
  preserve it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -w @sleeper-draft-assistant/api -- sqlite-app-database.test.ts data-management-routes.test.ts decision-log-store.test.ts settings-store.test.ts` | all pass |
| API check | `npm run check -w @sleeper-draft-assistant/api` | exit 0 |
| Canonical gates | `npm run check && npm test && npm run build && npm audit && git diff --check` | exit 0 |

## Scope

**In scope**:

- `apps/api/src/sqlite-app-database.ts` and tests
- A narrow injectable persistence adapter if required for failure injection
- Data-management/reset route or extracted service and tests
- Stores/codecs directly needed for versioned values
- `packages/shared/src/index.ts` for existing-domain Zod codecs
- Relevant persistence documentation

**Out of scope**:

- Replacing sql.js with native SQLite
- Backup/restore UI, cloud sync, or changed privacy promises
- API route decomposition except extracting a reset service needed for testing
- Import parsing/matching refactors

## Steps

### Step 1: Add deterministic persistence-failure injection

Inject the durable writer into `SqliteAppDatabase` without weakening path or
permission checks in production. Add tests proving the current failure mode:
after a simulated replacement failure, neither in-memory reads nor a reopened
database may expose the attempted mutation.

**Verify**: new tests fail on current implementation for the expected divergence.

### Step 2: Add logical mutation batches with restoration

Provide a database batch/transaction API used by stores. A logical action must
produce at most one export. If durable replacement fails, restore the exact
pre-action in-memory state before returning the error. Do not assume SQL rollback
alone repairs memory after a failed export; assert both memory and reopened disk.

**Verify**: failure tests and an export-count test pass.

### Step 3: Make decision insert-plus-prune one batch

Change decision recording to insert and prune within one logical action and one
durable export. Preserve ordering and maximum-history semantics.

**Verify**: decision-store tests pass and export spy reports one export.

### Step 4: Make reset one logical action

Clear all app-owned namespaces, decision snapshots, and settings in one batch.
Return success only after the durable replacement succeeds. On failure, all data
must remain visible both in memory and after reopen.

**Verify**: route tests cover success, injected failure, and all-or-nothing state.

### Step 5: Invalidate pre-reset asynchronous writes

Add an application data generation owned by the service composing AI work and
reset. Capture it before provider awaits; compare it before every post-await plan
or snapshot write. Increment it as reset starts and cancel provider work where
the existing interface permits. A transaction alone is not sufficient.

**Verify**: a deferred fake provider completes after reset and persists nothing.

### Step 6: Add two-level versioning and codecs

Use a database schema version for table/index migrations. Wrap domain JSON records
with `{ version, data }` and decode with the relevant Zod schema. Unknown versions
must produce a controlled migration/reset warning without leaking record contents.
Add representative legacy fixtures from supported alpha shapes; never invent a
destructive conversion when the old shape is ambiguous.

**Verify**: current, legacy, corrupt, and unknown-version fixture tests pass.

### Step 7: Update persistence documentation and validate

Document migration failure behavior and recoverability in `docs/ARCHITECTURE.md`
and `docs/INSTALLING.md`. Run API security smoke and canonical gates.

**Verify**: all commands above exit 0; POSIX disposable files remain 0600/0700.

## Done criteria

- [ ] Each logical action durably exports at most once.
- [ ] Failed durability restores in-memory and on-disk state.
- [ ] Reset is all-or-nothing and invalidates pre-reset AI writes.
- [ ] Stored domains are runtime-decoded and versioned.
- [ ] Unknown versions fail with controlled, non-sensitive guidance.
- [ ] Canonical gates and API security smoke pass.

## STOP conditions

- A legacy value cannot be migrated without guessing user data.
- sql.js export behavior during transactions cannot be proven by tests.
- The design acknowledges success before durable replacement.
- Implementation requires replacing the storage engine.

## Maintenance notes

New persisted domains must define a codec, record version, migration policy, and
failure fixture. New long-running writes must capture the application generation.


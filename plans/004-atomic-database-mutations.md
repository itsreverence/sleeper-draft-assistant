# Plan 004: Make database mutations atomic and batchable

> **Executor instructions**: Prove failure behavior before changing the
> implementation. Use the public database and store interfaces; do not test
> sql.js internals. Update `plans/README.md` when status changes.
>
> **Drift check (run first)**:
> `git diff --stat 28e8cab..HEAD -- apps/api/src/sqlite-app-database.ts apps/api/src/sqlite-app-database.test.ts apps/api/src/decision-log-store.ts apps/api/src/decision-log-store.test.ts`

## Status

- **State**: DONE — canonical gates passed 2026-08-16
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 001–003
- **Category**: bug / performance
- **Planned at**: commit `28e8cab`, 2026-08-16

## Why this matters

Every sql.js mutation currently exports the complete database. If durable file
replacement fails, the request reports failure while the live database retains
the mutation. Decision recording also exports once for insert and again for
prune. The storage boundary must make one logical action visible everywhere or
nowhere.

## Scope

**In scope**:

- Injectable durable-write seam for deterministic failure tests
- Exact in-memory restoration after failed durable replacement
- Nested-safe logical mutation batching with at most one export
- Decision insert-plus-prune as one durable action
- Store memory remaining unchanged when its database action fails

**Out of scope**:

- Reset orchestration and in-flight AI invalidation (Plan 007)
- Persisted-record codecs and migrations (Plan 008)
- Replacing sql.js or adopting write-behind persistence

## Steps

1. Add public-boundary tests proving that a failed replacement leaves both the
   live database and a reopened database at the prior value.
2. Add an export/write-count test proving a logical batch persists once.
3. Introduce the narrow writer injection and batch API needed by those tests.
   Preserve synchronous durability and owner-private replacement in production.
4. Move decision insert and prune into one batch, updating the store map only
   after the database action succeeds.
5. Test nested batching, thrown callbacks, deletes/no-op deletes, and pruning.
6. Document the atomic logical-action contract and run canonical gates.

## Done criteria

- [x] A failed durable write changes neither live nor reopened state.
- [x] A successful logical batch performs exactly one durable write.
- [x] Decision insert-plus-prune performs one write and preserves its limit.
- [x] Store memory cannot get ahead of the database after a write failure.
- [x] Existing file permissions and synchronous durability are preserved.
- [x] Canonical gates pass.

## STOP conditions

- Restoration cannot be proven through public reads and reopen.
- Batching would acknowledge success before durable replacement.
- The design depends on undocumented transaction-export behavior.

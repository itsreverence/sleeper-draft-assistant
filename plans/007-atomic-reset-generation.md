# Plan 007: Make reset atomic and invalidate stale asynchronous writes

> **Executor instructions**: Start only after Plan 004 establishes the database
> batch contract. Reset is an application-level operation, not just a database
> transaction.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 004
- **Category**: bug / privacy
- **Planned at**: commit `28e8cab`, 2026-08-16

## Why this matters

Reset currently clears stores through independent writes, and an AI request
started before reset can persist a plan or decision snapshot after deletion.
Users need one all-or-nothing local-data guarantee across both storage and
long-running provider work.

## Scope and steps

1. Characterize successful reset, injected mid-reset failure, and a deferred AI
   turn completing after reset.
2. Compose every app-owned clear into one Plan 004 database batch and update
   store memory only after durable success.
3. Add an application data generation captured before provider awaits and
   checked before every post-await persistence operation.
4. Increment the generation when reset begins and cancel active provider work
   where the existing supported interface permits.
5. Cover clear/reset reverse paths and document the deletion guarantee.

## Done criteria

- [ ] Reset is all-or-nothing in memory and after reopen.
- [ ] Provider work begun before reset cannot repopulate local data.
- [ ] Reset failures retain the prior usable state and report safely.
- [ ] Canonical gates and API security smoke pass.


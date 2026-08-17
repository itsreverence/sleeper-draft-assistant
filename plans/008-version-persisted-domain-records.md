# Plan 008: Version and decode persisted domain records

> **Executor instructions**: Do not invent a migration when an old shape is
> ambiguous. Capture representative supported-alpha fixtures before changing
> serialization.

## Status

- **State**: DONE — canonical gates and API startup/security smoke passed 2026-08-16
- **Priority**: P2
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 004, 007
- **Category**: migration / correctness
- **Planned at**: commit `28e8cab`, 2026-08-16

## Why this matters

Persisted JSON is read through unchecked generic casts. A future shape change or
corrupt value can therefore fail far from the storage boundary or silently enter
the application with the wrong meaning.

## Scope and steps

1. Inventory each persisted domain and capture current and supported legacy
   fixtures without recording sensitive user values.
2. Separate database schema versioning from domain-record versioning.
3. Wrap each domain value as `{ version, data }` and decode it with its runtime
   codec at the storage/store boundary.
4. Add explicit migrations for known versions. Unknown, corrupt, or ambiguous
   values must produce controlled non-sensitive recovery guidance.
5. Test current, legacy, corrupt, and unknown-version fixtures plus clear/reset
   reverse paths.
6. Document migration and recovery behavior in architecture/install guidance.

## Done criteria

- [x] Every persisted domain has a codec, record version, and migration policy.
- [x] Supported legacy fixtures migrate deterministically.
- [x] Unknown/corrupt records fail with controlled, non-sensitive guidance.
- [x] No destructive conversion guesses at user data.
- [x] Canonical gates pass.

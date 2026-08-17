# Plan 005: Split API routes mechanically by domain

> **Executor instructions**: This plan moves ownership without changing behavior.
> Complete persistence plan 004 first. Compare every response and middleware
> boundary against characterization tests. Stop if extraction suggests a product
> redesign. Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat b097275..HEAD -- apps/api/src/index.ts apps/api/src/*.test.ts apps/api/src/ai/*.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 001 and 004
- **Category**: tech-debt
- **Planned at**: commit `b097275`, 2026-08-12
- **Status**: DONE — canonical gates and API security smoke passed 2026-08-16

## Why this matters

`apps/api/src/index.ts` constructs global services, registers 39 middleware/routes,
assembles domain payloads, handles AI, and owns SSE. Mechanical route extraction
will make boundaries reviewable and testable, provided authentication and error
redaction remain centralized and route modules receive only narrow dependencies.

## Current state

- `index.ts:41-56` constructs the Hono app and every store/provider dependency.
- `index.ts:85-97` installs CORS and capability-token middleware globally.
- `index.ts:101-918` interleaves data, settings, connection, team, import, draft,
  strategy, decision, and event routes.
- `index.ts:920-1303` also owns payload assembly, redaction, errors, and SSE logic.
- `api-auth.test.ts` and `error-redaction.test.ts` protect cross-cutting behavior;
  `data-management-routes.test.ts` demonstrates route-level testing through `app`.
- `docs/ARCHITECTURE.md:29-35` requires token authentication for every non-health
  route and treats CORS/loopback as insufficient authorization.

## Target structure

Keep `index.ts` responsible for:

- constructing the app and concrete process-scoped dependencies;
- installing CORS, capability auth, and final error policy;
- mounting domain route registrars;
- binding loopback and shutdown.

Create cohesive modules such as:

- `routes/data-routes.ts`
- `routes/settings-routes.ts`
- `routes/team-routes.ts`
- `routes/draft-routes.ts`
- `routes/import-routes.ts`

Names may be adjusted to existing domain vocabulary. Each registrar receives an
explicit narrow object containing only dependencies it invokes. Do not introduce
one `AppServices`/container passed to every module.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| API tests | `npm test -w @sleeper-draft-assistant/api` | all pass |
| API check | `npm run check -w @sleeper-draft-assistant/api` | exit 0 |
| Canonical gates | `npm run check && npm test && npm run build && npm audit && git diff --check` | exit 0 |

## Scope

**In scope**:

- `apps/api/src/index.ts`
- New modules under `apps/api/src/routes/`
- Route characterization tests under `apps/api/src/`
- Small exported payload/error helpers when shared by multiple route modules
- `docs/ARCHITECTURE.md` workspace description if file ownership changes

**Out of scope**:

- API URL, method, body, query, status, or response-shape changes
- Authentication, CORS policy, loopback binding, redaction, or CSP changes
- Store redesign, import consolidation, provider protocol changes
- A generic dependency-injection framework or global service locator

## Steps

### Step 1: Lock route inventory and cross-cutting behavior

Add a test enumerating expected methods/paths or exercise every route family with
auth missing. Assert `/health` remains the only unauthenticated path, non-health
routes reject missing tokens outside test bypass configuration, and representative
errors remain redacted.

**Verify**: API auth and route-inventory tests pass before moving code.

### Step 2: Extract pure payload/error helpers

Move only helpers used by more than one route module into named domain files.
Keep `handleRouteError` under the central app boundary or expose a narrow injected
handler. Do not create a generic `utils.ts`.

**Verify**: API check and tests pass with no route moved yet.

### Step 3: Extract low-coupling route families

Move data/settings first, then connection/import routes. Each registrar receives
only its stores and helper functions. Mount registrars after the unchanged global
middleware in `index.ts`.

**Verify**: after each family, API tests pass and route inventory is unchanged.

### Step 4: Extract Team Manager routes

Move team state, ask, ROS, and weekly projection orchestration together where they
share payload assembly. Preserve optional upstream-failure behavior and current
response shapes exactly.

**Verify**: team/import tests and complete API suite pass.

### Step 5: Extract draft and SSE routes

Move draft state/import/recommendation/strategy/question/decision/event routes.
Keep SSE scheduler ownership within the draft domain and preserve polling cadence,
generic stream errors, last-valid state, and cleanup.

**Verify**: draft refresh, event stream, recommendation, AI, and auth tests pass.

### Step 6: Reduce `index.ts` to composition

Remove migrated domain workflows. Confirm the file contains construction,
cross-cutting middleware, mounting, loopback serving, and shutdown only. Avoid a
line-count target; judge ownership by responsibilities and imports.

**Verify**:

```bash
rg -n '^app\.(get|post|put|delete)' apps/api/src/index.ts
```

→ only `/health` may remain directly registered, followed by canonical gates.

### Step 7: Run API security smoke

Follow `docs/WORKFLOW.md:43-62` with disposable data. Confirm loopback binding,
health access, token enforcement, CORS behavior, and POSIX permissions.

**Verify**: record all smoke results without including the test token or paths.

## Done criteria

- [x] `index.ts` contains composition and cross-cutting middleware, not domain workflows.
- [x] Route method/path/status/response inventory is unchanged.
- [x] Every non-health route remains capability-token protected.
- [x] Every route module receives only dependencies it uses.
- [x] No service locator, generic DI framework, or giant dependency container exists.
- [x] Canonical gates and API security smoke pass.

## STOP conditions

- Route extraction requires changing a public API contract.
- Authentication order differs after mounting a registrar.
- Tests expose previously unredacted sensitive errors or data.
- A route module requires nearly every process dependency; report the coupling
  rather than hiding it behind a container.

## Maintenance notes

Future routes should be added to the owning domain registrar and route inventory.
Reviewers should scrutinize middleware mounting order and dependency breadth more
than line counts.

The completion review explicitly reassessed the dependency-breadth stop condition.
`data-routes.ts` necessarily spans every persisted category because it owns aggregate
inventory, category deletion, and atomic full reset. `draft-routes.ts` spans the
draft-only stores, provider, reset generation, and database batch used by the existing
strategy transaction, but does not receive Team Manager's ROS or weekly stores. These
dependencies remain individually named and reset-safe; splitting them behind a common
container would hide rather than reduce the observed domain coupling.

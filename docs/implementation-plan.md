# Implementation Plan

## Build Strategy

Build the product in thin vertical slices. Each slice should preserve the final architecture:

- backend owns data access, Sleeper sync, AI providers, and context assembly;
- engine package owns deterministic signals;
- frontend renders state and asks questions;
- AI is integrated early through an interface, but not allowed to block non-AI draft tracking.

Do not start by building a large optimizer. Start by making the app understand the user's league and team, then make the AI useful over that context.

## Decisions To Lock Now

Lock these for the first implementation:

- Sleeper first;
- standalone local web app;
- Svelte + Vite frontend;
- Hono + Node backend;
- TypeScript across the repo;
- SQLite local persistence;
- Drizzle for schema and migrations;
- Zod for API contracts;
- npm workspaces;
- SSE for live draft updates;
- advisory-only actions.

## Decisions To Defer

Defer these until the app has a working draft MVP:

- Chrome extension/userscript overlay;
- non-Sleeper platforms;
- automated Sleeper actions;
- hosted SaaS deployment;
- paid data-provider integrations;
- complex lineup optimizer;
- trade value engine;
- mobile-native app;
- multi-user hosted auth.

## First Vertical Slice

Goal: prove the local app shape before real Sleeper and AI complexity.

Build:

- workspace skeleton;
- web app shell;
- API health endpoint;
- mock draft state endpoint;
- SSE mock draft event stream;
- small fake player pool;
- engine function that creates candidate signals;
- UI that displays draft state, candidates, and a mock AI recommendation.

Why this first:

- validates Svelte, Hono, SSE, workspace layout, and engine boundaries;
- creates a UI target before Sleeper integration;
- gives tests something meaningful to run;
- keeps AI provider work isolated.

Done when:

- `npm run dev` runs web and API;
- web app renders a mock draft room;
- mock picks stream into the UI;
- a recommendation card updates from mock state;
- `npm run check`, `npm run build`, and `npm test` pass.

## Second Vertical Slice

Goal: replace mock draft state with real Sleeper sync.

Build:

- Sleeper client;
- connect flow by username, league ID, or draft ID;
- league/draft/roster/pick normalization;
- SQLite schema and migrations;
- cache Sleeper player map;
- poll draft picks;
- expose normalized draft state to frontend.

Done when:

- user can connect to a real Sleeper draft;
- draft picks and rosters persist locally;
- frontend updates as picks arrive;
- fixtures cover Sleeper response shapes.

## Third Vertical Slice

Goal: make the app useful before AI.

Build:

- CSV rankings/projections import;
- player matching;
- available player filtering;
- roster need calculation;
- candidate set builder;
- deterministic signals;
- top candidates panel.

Done when:

- app can show reasonable draft candidates from imported rankings;
- user can inspect why each candidate is relevant;
- engine tests cover major scoring and roster construction cases.

## Fourth Vertical Slice

Goal: add AI-first recommendations over real context.

Build:

- `AiProvider` interface;
- `NoopAiProvider`;
- structured recommendation schema;
- AI context packet builder;
- recommendation endpoint;
- draft question endpoint;
- context snapshots;
- recommendation UI with evidence and uncertainty.

Done when:

- user can ask who to draft;
- AI response includes recommendation, alternatives, confidence, risks, and assumptions;
- AI failures degrade gracefully;
- deterministic context remains visible.

## Fifth Vertical Slice

Goal: prove subscription-backed AI viability.

Build:

- isolated Codex SDK/app-server spike;
- local auth/session documentation;
- provider implementation only if spike succeeds;
- latency and reliability notes;
- fallback path to API-key provider.

Done when:

- subscription-backed provider is either working behind `AiProvider`, or explicitly deferred with a documented blocker.

## Sixth Vertical Slice

Goal: expand from draft assistant to weekly team manager.

Build:

- weekly roster sync;
- lineup candidate context;
- projection import for weekly decisions;
- start/sit questions;
- waiver/drop question flow;
- decision log review.

Done when:

- user can ask lineup and waiver questions against their Sleeper roster;
- app shows data freshness and missing assumptions;
- decisions can be reviewed later.

## First Code Tasks

When implementation starts, do this order:

1. Create npm workspace and root scripts.
2. Create `packages/shared` with initial Zod schemas.
3. Create `packages/engine` with mock draft types and candidate signal tests.
4. Create `apps/api` with Hono health, mock draft state, and SSE.
5. Create `apps/web` with Svelte draft dashboard consuming those endpoints.
6. Add build/check/test CI-equivalent scripts.
7. Add Sleeper client only after the mock vertical slice works.

## Early Test Fixtures

Create fixtures for:

- 10-team snake draft;
- 12-team snake draft;
- superflex roster settings;
- keeper pick already assigned;
- traded picks;
- user drafting near turn;
- positional run;
- incomplete player projection import.

## AI Prompting Rules

The recommendation prompt should:

- state the exact decision being made;
- include league scoring and roster settings;
- include current roster and candidate set;
- include deterministic signals;
- identify missing data;
- require structured output;
- require alternatives and uncertainty;
- forbid recommending already-drafted players;
- distinguish facts from inference.

## Implementation Guardrails

- Keep Sleeper API types separate from internal normalized types.
- Store raw integration payloads only when useful for debugging.
- Avoid frontend-only business logic.
- Make every AI answer reproducible from a saved context snapshot.
- Keep provider-specific auth and request code out of product routes.
- Keep engine functions pure where practical.
- Prefer boring UI over decorative UI; this is a repeated-use management tool.


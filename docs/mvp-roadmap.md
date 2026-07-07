# MVP Roadmap

## Phase 0: Planning And Spikes

Goal: remove the riskiest unknowns before building too much surface area.

Tasks:

- confirm Sleeper endpoints needed for draft state;
- spike Hono SSE endpoint;
- spike SQLite + Drizzle migrations;
- spike Svelte consuming API and SSE updates;
- spike `AiProvider` with `NoopAiProvider`;
- spike Codex SDK/app-server provider separately;
- define import format for rankings/projections.

Exit criteria:

- local app shell can receive streamed mock draft events;
- engine can rank a small fake player pool;
- AI provider interface is stable enough for MVP;
- Codex subscription route is classified as usable, workaround-needed, or deferred.

## Phase 1: Project Skeleton

Goal: create the repo structure and baseline developer workflow.

Tasks:

- npm workspace setup;
- Svelte/Vite app;
- Hono API app;
- shared Zod package;
- engine package;
- SQLite/Drizzle setup;
- Vitest setup;
- lint/typecheck/build scripts;
- basic app layout.

Exit criteria:

- `npm run dev` starts frontend and backend;
- `npm run check`, `npm run build`, and `npm test` pass;
- frontend can call backend health endpoint.

## Phase 2: Sleeper Data Foundation

Goal: ingest and normalize Sleeper league/draft data.

Tasks:

- Sleeper API client;
- local rate limiting and retries;
- player map cache;
- league sync;
- roster sync;
- draft sync;
- picks sync;
- traded pick handling;
- normalized draft state DTO;
- mock fixtures from real-looking Sleeper payloads.

Exit criteria:

- user can enter Sleeper username, league ID, or draft ID;
- backend creates a local league/draft record;
- frontend shows league settings, teams, draft status, and picks;
- tests cover normalization edge cases.

## Phase 3: Draft Room UI

Goal: make the live draft usable without AI.

Tasks:

- draft board;
- pick feed;
- team/roster panel;
- available player table;
- position filters;
- search;
- current pick and user's upcoming picks;
- SSE polling/update loop;
- connection and stale-data states.

Exit criteria:

- app follows a live or mocked Sleeper draft;
- available player pool updates after each pick;
- stale or failed Sleeper polling is visible.

## Phase 4: Rankings And Signals

Goal: provide enough deterministic structure for useful AI recommendations.

Tasks:

- CSV import for rankings/projections;
- player matching flow for unmatched names;
- value over baseline;
- tiers;
- roster need;
- ADP value;
- pick return probability approximation;
- positional scarcity;
- risk flags from available metadata/imports;
- candidate set builder for AI prompts.

Exit criteria:

- app shows top candidate players with signals;
- engine tests cover scoring, tiers, roster fit, and availability;
- deterministic view is useful if AI is disabled.

## Phase 5: AI Draft Manager

Goal: AI-first recommendation flow for live draft decisions.

Tasks:

- `AiProvider` interface;
- `NoopAiProvider`;
- prompt/context builder;
- structured response schema;
- recommendation endpoint;
- draft Q&A endpoint;
- response renderer;
- decision log;
- provider status UI.

Exit criteria:

- user can ask "Who should I draft?" and get a structured answer;
- answer includes recommendation, alternatives, confidence, risks, and evidence;
- AI failure leaves deterministic signals intact;
- context snapshots are persisted for debugging.

## Phase 6: Codex Subscription Provider Spike

Goal: determine whether subscription-backed AI can be reliable enough for daily use.

Tasks:

- try official Codex SDK/app-server route first;
- test auth requirements and local session behavior;
- test structured recommendation prompt;
- test latency during pick-clock conditions;
- test streaming or progress updates;
- document limitations;
- decide whether to implement or defer experimental ChatGPT/Codex backend provider.

Exit criteria:

- provider can answer draft-context questions locally, or
- provider is deferred with a clear reason and `OpenAiApiProvider` becomes the next practical option.

## Phase 7: Weekly Manager MVP

Goal: extend from draft assistant to team manager.

Tasks:

- weekly roster state;
- starter/bench comparison;
- lineup recommendation context;
- waiver candidate import/manual entry;
- drop candidate signals;
- weekly AI Q&A;
- decision log outcomes.

Exit criteria:

- user can ask start/sit and waiver questions against their Sleeper roster;
- AI receives projections/rankings and roster constraints;
- recommendations show assumptions and missing data.

## Key Risks

### AI Provider Reliability

Subscription-backed Codex integration may not behave like a stable general app API. Keep it isolated and preserve an API-key path.

### Data Quality

Sleeper does not provide every projection, injury, news, or usage signal needed for strong weekly management. Start with imports and add providers later.

### Player Matching

Imported rankings may not map cleanly to Sleeper IDs. Build reviewable matching rather than silently guessing.

### Draft Timing

AI calls must be fast enough for live picks. The system should precompute candidate context and support quick deterministic fallback.

### Over-Automation

Do not automate Sleeper actions early. Keep the product advisory until recommendations prove trustworthy.

## Validation Strategy

Use three kinds of tests:

- unit tests for engine calculations;
- fixture tests for Sleeper normalization;
- scenario tests for draft decisions.

Use mocked draft scenarios:

- early round balanced board;
- positional run;
- zero-RB start;
- late QB value;
- thin TE tier;
- injury-risk player available at discount;
- user pick approaching after long gap.

For AI evaluation, store context snapshots and compare:

- whether the recommendation respects roster/scoring constraints;
- whether it identifies missing data;
- whether it gives useful alternatives;
- whether it avoids hallucinating unavailable players.


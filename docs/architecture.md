# Architecture

## Recommended Stack

Use a TypeScript monorepo:

```text
apps/web        Svelte + Vite + TypeScript
apps/api        Hono + Node.js + TypeScript
packages/shared Zod schemas, DTOs, shared constants
packages/engine Draft and roster signal engine
data            SQLite + Drizzle
ai              Backend-only AiProvider adapters
```

Use npm workspaces first. Add heavier monorepo tooling only when the repo outgrows basic scripts.

## Why This Shape

The app needs a real backend because it must protect AI credentials/session material, poll Sleeper, cache player metadata, store imported data, assemble AI context, and keep deterministic signal generation out of the browser.

The frontend should be lightweight and state-oriented. Svelte is a good fit for live draft and roster views where the UI is mostly derived from changing state.

Hono is a good first backend choice because the API surface is small, TypeScript-friendly, and compatible with Web-standard request/response patterns. If Hono becomes awkward for background jobs, server-sent events, or local process lifecycle, Fastify remains the fallback.

## Runtime Components

### Web App

Responsibilities:

- draft dashboard;
- roster view;
- player search and filters;
- recommendation panel;
- AI chat surface;
- settings/import screens;
- local connection status;
- streamed draft events from the backend.

The web app should not:

- call AI providers directly;
- store AI tokens;
- call Sleeper directly except possibly harmless debug tools;
- own recommendation logic.

### API Server

Responsibilities:

- Sleeper API client;
- polling and cache refresh;
- SQLite persistence;
- imported projections/rankings processing;
- deterministic signal generation;
- AI provider orchestration;
- server-sent event stream;
- request validation;
- local settings.

### Shared Package

Responsibilities:

- Zod schemas for API inputs/outputs;
- TypeScript DTOs inferred from schemas;
- common enums such as position, scoring format, roster slot, draft status;
- minimal shared helpers with no runtime-specific dependencies.

### Engine Package

Responsibilities:

- normalize league settings;
- calculate roster needs;
- calculate player availability;
- calculate player value signals;
- calculate draft board signals;
- create AI context packets.

The engine should not call Sleeper, SQLite, or AI providers. It should be deterministic and testable with plain inputs.

### AI Package

Responsibilities:

- define the `AiProvider` interface;
- implement provider adapters;
- normalize AI requests and responses;
- hide experimental provider details from product code.

## External Integrations

### Sleeper

Use Sleeper first. MVP should use:

- user lookup;
- user leagues;
- league details;
- league rosters;
- league users;
- league traded picks;
- draft details;
- draft picks;
- draft traded picks;
- NFL player map;
- NFL state.

Sleeper data is read-only and tokenless, so polling is acceptable with rate limiting and caching.

### AI Providers

Provider priority:

1. `CodexSdkProvider`: official local Codex SDK/app-server route if it fits the app's Q&A needs.
2. `ExperimentalCodexBackendProvider`: isolated provider based on the ha-codex-assist pattern only if needed.
3. `OpenAiApiProvider`: API-key provider later.
4. `NoopAiProvider`: deterministic-only fallback for testing and offline use.

The provider interface should support:

- single-turn structured recommendations;
- conversational follow-up;
- optional streaming;
- model/provider metadata;
- clear auth failure states.

Draft manager code should depend only on `AiProvider`, never a concrete provider.

## Data Model

### League

Fields:

- `id`;
- `platform`;
- `sleeperLeagueId`;
- `name`;
- `season`;
- `status`;
- `scoringSettingsJson`;
- `rosterPositionsJson`;
- `settingsJson`;
- `createdAt`;
- `updatedAt`.

### Draft

Fields:

- `id`;
- `sleeperDraftId`;
- `leagueId`;
- `type`;
- `status`;
- `season`;
- `settingsJson`;
- `metadataJson`;
- `draftOrderJson`;
- `slotToRosterIdJson`;
- `lastPickedAt`;
- `createdAt`;
- `updatedAt`.

### Team / Roster

Fields:

- `id`;
- `leagueId`;
- `sleeperRosterId`;
- `ownerUserId`;
- `displayName`;
- `playersJson`;
- `startersJson`;
- `metadataJson`;
- `createdAt`;
- `updatedAt`.

### Player

Fields:

- `id`;
- `sleeperPlayerId`;
- `fullName`;
- `firstName`;
- `lastName`;
- `team`;
- `position`;
- `fantasyPositionsJson`;
- `status`;
- `injuryStatus`;
- `searchRank`;
- `metadataJson`;
- `updatedAt`.

### Pick

Fields:

- `id`;
- `draftId`;
- `sleeperPickNo`;
- `round`;
- `draftSlot`;
- `rosterId`;
- `pickedByUserId`;
- `playerId`;
- `isKeeper`;
- `metadataJson`;
- `pickedAt`;
- `createdAt`.

### Projection / Ranking

Fields:

- `id`;
- `source`;
- `season`;
- `format`;
- `playerId`;
- `rank`;
- `tier`;
- `projectedPoints`;
- `adp`;
- `riskTagsJson`;
- `metadataJson`;
- `importedAt`.

### Decision Log

Fields:

- `id`;
- `leagueId`;
- `draftId`;
- `week`;
- `decisionType`;
- `contextSnapshotId`;
- `recommendationJson`;
- `userChoiceJson`;
- `outcomeJson`;
- `createdAt`.

### AI Context Snapshot

Fields:

- `id`;
- `purpose`;
- `leagueId`;
- `draftId`;
- `teamId`;
- `inputSummaryJson`;
- `signalsJson`;
- `promptText`;
- `provider`;
- `model`;
- `responseJson`;
- `createdAt`.

## Deterministic Signals

The deterministic engine should produce signals, not final truth.

Draft signals:

- projected points;
- value over baseline;
- tier;
- roster fit;
- positional scarcity;
- ADP value;
- pick return probability;
- bye-week conflicts;
- stack/correlation notes;
- injury/status risk;
- age/role risk when data exists;
- team construction flags.

Weekly signals:

- projected points;
- floor/ceiling if provided;
- matchup rank if provided;
- injury status;
- bye status;
- roster slot eligibility;
- replacement options;
- concentration risk;
- start/sit deltas.

These signals feed both the UI and AI context.

## AI Context Packet

Each AI call should receive a compact structured packet:

- task type;
- league scoring and roster settings;
- user's team state;
- current draft or week state;
- candidate players or lineup choices;
- deterministic signals;
- data source freshness;
- explicit missing-data notes;
- response schema instructions.

Avoid dumping the entire player universe into the prompt. Retrieve and rank a focused candidate set first.

## API Sketch

Initial endpoints:

- `GET /health`;
- `POST /sleeper/connect`;
- `GET /leagues`;
- `GET /leagues/:leagueId`;
- `POST /drafts/:draftId/sync`;
- `GET /drafts/:draftId/state`;
- `GET /drafts/:draftId/events`;
- `GET /drafts/:draftId/recommendations`;
- `POST /drafts/:draftId/ask`;
- `POST /imports/rankings`;
- `GET /settings`;
- `PATCH /settings`.

Use SSE for `GET /drafts/:draftId/events`.

## Local Development

Target scripts:

- `npm install`;
- `npm run dev`;
- `npm run build`;
- `npm run check`;
- `npm test`.

The first implementation should include a mock draft mode so UI and engine work can proceed without waiting for a live draft.


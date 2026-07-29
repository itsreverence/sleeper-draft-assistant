# Architecture

Sleeper Draft Assistant is an npm-workspace TypeScript application with an Electron shell, Svelte renderer, loopback Hono API, deterministic engine, and shared schemas.

```text
Electron main process
  ├─ starts API on 127.0.0.1 with a random capability token
  ├─ starts Vite in development or loads packaged renderer assets
  └─ restricts navigation and external links

Svelte renderer
  └─ authenticated HTTP/SSE → Hono API
       ├─ Sleeper read-only API client
       ├─ ranking CSV importer
       ├─ weekly projection CSV importer
       ├─ grounded candidate and safety engine
       ├─ optional local Codex app-server adapter
       └─ sql.js SQLite persistence
```

## Workspaces

- `apps/desktop`: Electron lifecycle, process startup, window containment, packaging.
- `apps/web`: Svelte UI and authenticated local API client.
- `apps/api`: Hono routes, Sleeper normalization, persistence, provider adapters, SSE.
- `packages/engine`: grounded candidate generation, roster feasibility, fallback draft analysis, and team-management calculations with no network or persistence dependency.
- `packages/shared`: Zod schemas and shared TypeScript types.

## Trust boundary

The API binds explicitly to `127.0.0.1`. Every route except `GET /health` requires a high-entropy bearer token generated for that application launch. The renderer receives it at startup and retains it in memory; SSE uses the same token because browser `EventSource` cannot set an authorization header.

CORS permits the packaged `file://` renderer compatibility case, but CORS is not authorization. Requests without the capability token are rejected. This boundary protects against ordinary drive-by browser requests; it does not protect against code already running as the same OS user.

Electron runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. A CSP limits renderer resources and connections to local application endpoints. Unexpected navigation is denied, and only allowlisted HTTPS destinations can be opened externally.

## Data flow

1. The user identifies a Sleeper account, league, or draft.
2. The API reads tokenless data from Sleeper and normalizes it into shared models.
3. Normalization produces one format-compatibility assessment for draft and team workflows. Conventional standard, half-PPR, PPR, FLEX, and superflex leagues are supported; custom scoring and TE premium produce cautions; IDP and auction formats are marked unsupported.
4. A user-supplied FantasyPros draft rankings CSV adds scoring-specific ECR, tiers, bye weeks, and expert-versus-market context. Known scoring mismatches are rejected.
5. User-supplied FantasyPros season projection files for QB, RB, WR, TE, K, and DST are normalized and, where the export exposes the required statistics, rescored with the connected Sleeper league settings. K and DST retain provider points when exact league scoring cannot be reproduced.
6. A user-supplied FantasyPros Overall ADP CSV adds Sleeper ADP and Real-Time ADP. Sleeper ADP drives platform-specific value; the more aggressive of Sleeper and Real-Time ADP informs pick-return risk.
7. These draft signals remain separate in the model and persistence layer. The repository does not ship ranking, projection, or ADP data.
8. A user-supplied FantasyPros overall rest-of-season rankings CSV adds scoring-specific ECR and expert disagreement to Team Manager. One overall export is used instead of separate position exports, and known scoring mismatches are rejected.
9. User-supplied weekly projection files add provider-scored week-specific points to lineup and waiver analysis. Weekly points drive immediate lineup ordering; rest-of-season ECR informs longer-term add, drop, and stash value.
10. Rest-of-season rankings are scoped to a league, season, and scoring format. Weekly projections are scoped to a league, season, and week. Stored historical or mismatched data cannot influence current advice.
11. The local engine evaluates import coverage, matching quality, format compatibility, player availability, and lineup feasibility, then supplies a broad grounded shortlist.
12. When Codex is configured, the AI strategist independently reranks that shortlist near the user's turn and returns a structured recommendation, alternatives, risks, and next-position plan. The backend validates the pick number and every returned player ID before exposing the decision.
12. Complete weekly lineups expose current-versus-optimized totals and per-swap point deltas; incomplete data remains explicitly partial.
13. Draft SSE polling checks the lightweight Sleeper picks endpoint every 2 seconds while drafting, every 5 seconds before the draft, and every 15 seconds after completion. A full state rebuild runs only when the pick count changes. Transient failures preserve the last valid state and use bounded backoff from 5 to 30 seconds; renderer events expose only a generic upstream-safe error plus sync age.
14. While Team Manager is visible, the renderer refreshes its existing read-only aggregate every 60 seconds and when the app regains focus. Transient refresh failures preserve the last successful team state.
15. Optional AI providers receive a compact context packet rather than the full player universe. AI-first strategy and candidate evaluation use dedicated authenticated backend routes. Responses are tagged with the current pick number, stale responses are discarded, and local fallback remains immediately available during provider latency or failure.
16. Settings, imports, and decision snapshots are persisted locally in `app.sqlite`. The draft workspace can review recent snapshots and recommendation changes without creating a second history store.
17. Authenticated data-management routes expose aggregate counts, category deletion, a typed-confirmation reset, and a support report that reduces decision history to non-identifying event metadata.

## Persistence

Packaged runs use Electron's per-user data directory. Development defaults to repository `data/` or `SLEEPER_AI_DATA_DIR` when supplied. Writes use atomic replacement, reject symlink components observed during path validation, and use owner-only POSIX permissions. The path checks are defense in depth, not a race-proof boundary against another process running as the same OS user. Windows privacy depends on the user's profile ACLs.

The renderer can clear draft rankings, season projections, draft ADP, rest-of-season rankings, weekly projections, or decision history independently. A full reset also restores provider settings and removes app-owned renderer preferences before reload. Exported support reports omit database contents, local paths, identifiers, names, recommendation text, imported values, and provider credentials.

## Provider boundary

`AiProvider` keeps provider-specific behavior out of route and renderer code. Its draft strategy method returns a validated structured decision rather than prose:

- `noop`: local fallback response; default and offline-safe.
- `codex-app-server`: supported optional local integration with a user-installed Codex CLI.

Executable configuration is limited to commands or paths ending in `codex`, `codex.exe`, or `codex.cmd`.
On Windows, npm launchers are resolved to their known `@openai/codex/bin/codex.js` entry point and `node.exe`; arbitrary shell execution is not enabled.

## Known architectural limits

- Persistence uses `sql.js`, so the database is exported after mutations rather than managed by a native SQLite service.
- The API is local single-user software; it is not designed for LAN or multi-user hosting.
- Signed installers are not implemented.
- Draft, rest-of-season, and weekly values require user-downloaded CSV exports; there is no automatic FantasyPros feed.
- IDP player values, auction budgets, and nomination strategy are not modeled.
- Custom scoring and TE-premium accuracy depends on importing values produced for the same format.
- Exact kicker and defense rescoring is unavailable when exports omit field-goal distance and points-allowed distributions.
- The capability token is not an IPC replacement and does not defend against same-user malware.

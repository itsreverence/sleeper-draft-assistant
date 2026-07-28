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
       ├─ deterministic recommendation engine
       ├─ optional local Codex app-server adapter
       └─ sql.js SQLite persistence
```

## Workspaces

- `apps/desktop`: Electron lifecycle, process startup, window containment, packaging.
- `apps/web`: Svelte UI and authenticated local API client.
- `apps/api`: Hono routes, Sleeper normalization, persistence, provider adapters, SSE.
- `packages/engine`: deterministic draft and roster analysis with no network or persistence dependency.
- `packages/shared`: Zod schemas and shared TypeScript types.

## Trust boundary

The API binds explicitly to `127.0.0.1`. Every route except `GET /health` requires a high-entropy bearer token generated for that application launch. The renderer receives it at startup and retains it in memory; SSE uses the same token because browser `EventSource` cannot set an authorization header.

CORS permits the packaged `file://` renderer compatibility case, but CORS is not authorization. Requests without the capability token are rejected. This boundary protects against ordinary drive-by browser requests; it does not protect against code already running as the same OS user.

Electron runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. A CSP limits renderer resources and connections to local application endpoints. Unexpected navigation is denied, and only allowlisted HTTPS destinations can be opened externally.

## Data flow

1. The user identifies a Sleeper account, league, or draft.
2. The API reads tokenless data from Sleeper and normalizes it into shared models.
3. A user-supplied FantasyPros draft rankings CSV adds scoring-specific ECR, tiers, bye weeks, and expert-versus-market context.
4. User-supplied FantasyPros season projection files for QB, RB, WR, TE, K, and DST are normalized and, where the export exposes the required statistics, rescored with the connected Sleeper league settings. K and DST retain provider points when exact league scoring cannot be reproduced.
5. A user-supplied FantasyPros Overall ADP CSV adds Sleeper ADP and Real-Time ADP. Sleeper ADP drives platform-specific value; the more aggressive of Sleeper and Real-Time ADP informs pick-return risk.
6. These draft signals remain separate in the model and persistence layer. The repository does not ship ranking, projection, or ADP data.
7. User-supplied weekly projection files may add week-specific points to lineup and waiver analysis.
8. Weekly projections are scoped to a league, season, and week. Stored historical or mismatched data is visible but cannot influence current advice.
9. The deterministic engine evaluates import coverage and matching quality before assigning lineup confidence.
10. Complete weekly lineups expose current-versus-optimized totals and per-swap point deltas; incomplete data remains explicitly partial.
11. While Team Manager is visible, the renderer refreshes its existing read-only aggregate every 60 seconds and when the app regains focus. Transient refresh failures preserve the last successful team state.
12. Optional AI providers receive a compact context packet rather than the full player universe.
13. Settings, imports, and decision snapshots are persisted locally in `app.sqlite`.
14. Authenticated data-management routes expose aggregate counts, category deletion, a typed-confirmation reset, and a support report that reduces decision history to non-identifying event metadata.

## Persistence

Packaged runs use Electron's per-user data directory. Development defaults to repository `data/` or `SLEEPER_AI_DATA_DIR` when supplied. Writes use atomic replacement, reject symlink components observed during path validation, and use owner-only POSIX permissions. The path checks are defense in depth, not a race-proof boundary against another process running as the same OS user. Windows privacy depends on the user's profile ACLs.

The renderer can clear draft rankings, season projections, draft ADP, weekly projections, or decision history independently. A full reset also restores provider settings and removes app-owned renderer preferences before reload. Exported support reports omit database contents, local paths, identifiers, names, recommendation text, imported values, and provider credentials.

## Provider boundary

`AiProvider` keeps provider-specific behavior out of route and renderer code:

- `noop`: deterministic response; default and offline-safe.
- `codex-app-server`: supported optional local integration with a user-installed Codex CLI.

Executable configuration is limited to commands or paths ending in `codex`, `codex.exe`, or `codex.cmd`.

## Known architectural limits

- Persistence uses `sql.js`, so the database is exported after mutations rather than managed by a native SQLite service.
- The API is local single-user software; it is not designed for LAN or multi-user hosting.
- Signed installers are not implemented.
- Draft and weekly values require user-downloaded CSV exports; there is no automatic FantasyPros feed.
- Exact kicker and defense rescoring is unavailable when exports omit field-goal distance and points-allowed distributions.
- The capability token is not an IPC replacement and does not defend against same-user malware.

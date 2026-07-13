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
3. A user-supplied FantasyPros CSV may add rankings, tiers, bye weeks, and value signals. The repository does not ship ranking data.
4. The deterministic engine ranks candidates and explains its evidence.
5. Optional AI providers receive a compact context packet rather than the full player universe.
6. Settings, imports, and decision snapshots are persisted locally in `app.sqlite`.

## Persistence

Packaged runs use Electron's per-user data directory. Development defaults to repository `data/` or `SLEEPER_AI_DATA_DIR` when supplied. Writes are atomic, reject symlink targets, and use owner-only POSIX permissions. Windows privacy depends on the user's profile ACLs.

## Provider boundary

`AiProvider` keeps provider-specific behavior out of route and renderer code:

- `noop`: deterministic response; default and offline-safe.
- `codex-app-server`: supported optional local integration with a user-installed Codex CLI.
- `experimental-codex-backend`: unsupported direct-backend research path, disabled unless explicitly opted in at build and runtime.

Executable configuration is limited to commands or paths ending in `codex`, `codex.exe`, or `codex.cmd`.

## Known architectural limits

- Persistence uses `sql.js`, so the database is exported after mutations rather than managed by a native SQLite service.
- The API is local single-user software; it is not designed for LAN or multi-user hosting.
- Weekly projection ingestion and signed installers are not implemented.
- The capability token is not an IPC replacement and does not defend against same-user malware.

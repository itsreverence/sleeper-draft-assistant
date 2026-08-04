# Architecture

Sleeper Draft Assistant is an npm-workspace TypeScript application with an Electron shell, Svelte renderer, loopback Hono API, a local evidence and safety engine, and shared schemas.

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
       ├─ grounded evidence and safety engine
       ├─ optional local Codex app-server adapter
       └─ sql.js SQLite persistence
```

## Workspaces

- `apps/desktop`: Electron lifecycle, process startup, window containment, packaging.
- `apps/web`: Svelte UI and authenticated local API client.
- `apps/api`: Hono routes, Sleeper normalization, persistence, provider adapters, SSE.
- `packages/engine`: transparent draft evidence ordering, roster feasibility safeguards, and team-management calculations with no network or persistence dependency.
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
6. A user-supplied FantasyPros Overall ADP CSV adds Sleeper ADP and Real-Time ADP as separate market-timing evidence.
7. These draft signals remain separate in the model and persistence layer. The repository does not ship ranking, projection, or ADP data.
8. A user-supplied FantasyPros overall rest-of-season rankings CSV adds scoring-specific ECR and expert disagreement to Team Manager. One overall export is used instead of separate position exports, and known scoring mismatches are rejected.
9. User-supplied weekly projection files add provider-scored week-specific points to lineup and waiver analysis. Weekly points drive immediate lineup ordering; rest-of-season ECR informs longer-term add, drop, and stash value.
10. Rest-of-season rankings are scoped to a league, season, and scoring format. Weekly projections are scoped to a league, season, and week. Stored historical or mismatched data cannot influence current advice.
11. The local engine evaluates import coverage, matching quality, format compatibility, player availability, and lineup feasibility. Its draft board uses a documented raw ordering of ECR, season projection, Sleeper ADP, Real-Time ADP, and finally Sleeper placeholder rank; it does not calculate a composite strategy score.
12. Real active drafts without current ECR open in a preparation workspace. Returning drafts with fresh matching ECR bypass it, while stale ECR is surfaced for review. Users can explicitly enter limited-data mode, but the renderer keeps a visible grounding warning.
13. Draft preparation records an explicit AI choice in addition to data readiness. Codex is recommended for the AI-first workflow, but users can continue without AI so provider installation or availability never blocks the read-only draft board.
14. When Codex is configured, the AI strategist receives neutral league, roster, board, and raw player evidence rather than a local strategic lean.
15. The provider can call backend-owned, read-only tools against an immutable current-pick snapshot: `search_available_players` for bounded player retrieval, `compare_players` for named alternatives, and `inspect_position_market` for positional supply and tier depth. These tools expose raw facts without applying recommendation-engine filtering or assigning scores. Sleeper draft normalization also preserves pick order, traded-pick ownership, and keeper metadata; market timing is labeled as exact Sleeper order, normal-snake fallback, or unsupported.
16. The backend validates the response pick, availability, exclusions, and player IDs; it also rejects choices that worsen a critical starter deficit or make an otherwise feasible required lineup impossible to complete.
17. Complete weekly lineups expose current-versus-optimized totals and per-swap point deltas; incomplete data remains explicitly partial.
18. Draft SSE polling checks the lightweight Sleeper picks endpoint every 2 seconds while drafting, every 5 seconds before the draft, and every 15 seconds after completion. A full state rebuild runs only when the pick count changes. Transient failures preserve the last valid state and use bounded backoff from 5 to 30 seconds; renderer events expose only a generic upstream-safe error plus sync age.
19. While Team Manager is visible, the renderer refreshes its existing read-only aggregate every 60 seconds and when the app regains focus. Transient refresh failures preserve the last successful team state.
20. AI-first strategy and contextual draft questions use dedicated authenticated backend routes. Structured strategy responses are tagged with the current pick number and stale responses are discarded. Draft conversation history is retained for follow-up wording while the latest Sleeper snapshot remains authoritative, and the renderer marks prior answers when the board advances.
21. The backend keeps one Codex app-server subprocess per active provider configuration and communicates through the supported JSONL-over-stdio transport. Turns are serialized and reuse one ephemeral thread per draft/team scope while the API process is running. The newest full draft or team snapshot is still sent on every turn; prior UI chat messages are omitted after thread reuse because app-server retains them. Changing provider settings or stopping the API closes the process and clears its thread map.
22. Each successful AI strategy includes a validated living draft plan with current and next-turn priorities, positions that can wait, roster goals, watch items, and a board-change summary. The latest plan is persisted by draft, team, and provider, then supplied as prior advisory strategy on the next AI turn.
23. Settings, imports, AI draft plans, and decision snapshots are persisted locally in `app.sqlite`. AI-triggered snapshots retain the validated structured strategy and living plan; the draft workspace collapses repeated same-pick plan shapes into a compact meaningful-change timeline without creating a second history store. Legacy recommendation-only snapshots remain readable.
24. User strategy guidance is persisted by draft and team. `next-pick` guidance expires after the draft advances; `draft` guidance remains active for the rest of that draft. AI conversation may return a structured proposal, but only an explicit renderer action can call the authenticated mutation route that applies it.
24. Authenticated data-management routes expose aggregate counts, category deletion, a typed-confirmation reset, and a support report that reduces decision history to non-identifying event metadata.

## Persistence

Packaged runs use Electron's per-user data directory. Development defaults to repository `data/` or `SLEEPER_AI_DATA_DIR` when supplied. Writes use atomic replacement, reject symlink components observed during path validation, and use owner-only POSIX permissions. The path checks are defense in depth, not a race-proof boundary against another process running as the same OS user. Windows privacy depends on the user's profile ACLs.

The renderer can clear draft rankings, season projections, draft ADP, rest-of-season rankings, weekly projections, or decision history independently. A full reset also restores provider settings and removes app-owned renderer preferences before reload. Exported support reports omit database contents, local paths, identifiers, names, recommendation text, imported values, and provider credentials.

## Provider boundary

`AiProvider` keeps provider-specific behavior out of route and renderer code. Its draft strategy method returns a validated structured decision rather than prose:

- `noop`: narrow offline response used to preserve the provider contract; default and not rendered as draft advice.
- `codex-app-server`: supported optional local integration with a user-installed Codex CLI.

The provider-neutral `AiTool` boundary keeps draft search logic in the API domain layer. The Codex adapter maps those definitions to experimental app-server dynamic tools; future providers can expose the same read-only tools through their own function-calling protocol.

The Codex adapter uses app-server's default stdio transport. WebSocket transport is not exposed to the renderer or used as an authorization boundary. Process-scoped thread reuse provides continuity independently of the transport.

Executable configuration is limited to commands or paths ending in `codex`, `codex.exe`, or `codex.cmd`.
On Windows, npm launchers are resolved to their known `@openai/codex/bin/codex.js` entry point and `node.exe`; arbitrary shell execution is not enabled.

## Known architectural limits

- Persistence uses `sql.js`, so the database is exported after mutations rather than managed by a native SQLite service.
- The API is local single-user software; it is not designed for LAN or multi-user hosting.
- Signed installers are not implemented.
- Draft, rest-of-season, and weekly values require user-downloaded CSV exports; there is no automatic FantasyPros feed.
- Auction pick timing is unsupported, and synthetic or legacy snapshots without normalized Sleeper pick order use a labeled normal-snake fallback. Keeper picks are preserved as metadata, but keeper-specific roster strategy remains outside the current draft model.
- IDP player values, auction budgets, and nomination strategy are not modeled.
- Custom scoring and TE-premium accuracy depends on importing values produced for the same format.
- Exact kicker and defense rescoring is unavailable when exports omit field-goal distance and points-allowed distributions.
- The capability token is not an IPC replacement and does not defend against same-user malware.

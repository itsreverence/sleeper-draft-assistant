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
       ├─ local Codex app-server adapter
       └─ sql.js SQLite persistence
```

## Workspaces

- `apps/desktop`: Electron lifecycle, process startup, window containment, packaging.
- `apps/web`: Svelte UI and authenticated local API client.
- `apps/api`: Hono composition plus domain route registrars, Sleeper normalization, persistence, provider adapters, and SSE. `index.ts` owns process-scoped construction, global capability-token/CORS middleware, centralized error redaction, loopback serving, and shutdown; route workflows live under `apps/api/src/routes/` with explicit domain dependencies.
- `packages/engine`: transparent draft evidence ordering, roster feasibility safeguards, and team-data readiness calculations with no network or persistence dependency.
- `packages/shared`: Zod schemas and shared TypeScript types.

## Trust boundary

The API binds explicitly to `127.0.0.1`. Every route except `GET /health` requires a high-entropy bearer token generated for that application launch. The renderer receives it at startup and retains it in renderer session storage so a renderer reload can recover without persisting the capability across application sessions; SSE uses the same token because browser `EventSource` cannot set an authorization header.

CORS permits the packaged `file://` renderer compatibility case, but CORS is not authorization. Requests without the capability token are rejected. This boundary protects against ordinary drive-by browser requests; it does not protect against code already running as the same OS user.

Electron runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. A CSP limits renderer resources and connections to local application endpoints. Unexpected navigation is denied, and only allowlisted HTTPS destinations can be opened externally.

## Data flow

1. The user identifies a Sleeper account, league, or draft.
2. The API reads tokenless data from Sleeper and normalizes it into shared models.
3. Normalization produces one format-compatibility assessment for draft and team workflows. Conventional standard, half-PPR, PPR, FLEX (including Sleeper's RB/WR `WRRB_FLEX` and WR/TE `REC_FLEX`), and superflex leagues are supported. Starter-slot eligibility lives in `packages/shared/src/roster-slots.ts`; custom scoring and TE premium produce cautions; IDP and auction formats are marked unsupported.
4. A user-supplied FantasyPros draft rankings CSV adds scoring-specific ECR, tiers, bye weeks, and expert-versus-market context. Known scoring mismatches are rejected.
5. User-supplied FantasyPros season projection files for QB, RB, WR, TE, K, and DST are normalized and, where the export exposes the required statistics, rescored with the connected Sleeper league settings. K and DST retain provider points when exact league scoring cannot be reproduced.
6. A user-supplied FantasyPros Overall ADP CSV adds Sleeper ADP and Real-Time ADP as separate market-timing evidence.
7. These draft signals remain separate in the model and persistence layer. The repository does not ship ranking, projection, or ADP data.
8. Team Manager uses scoring-specific season value rankings as a separate long-term signal. FantasyPros Overall ROS ECR is preferred; before it is available, a matching connected-draft import or user-supplied Overall Draft ECR CSV is labeled and used as draft ECR fallback. ROS always supersedes fallback, and fallback cannot overwrite active ROS. Known scoring mismatches are rejected.
9. User-supplied weekly projection files add provider-scored week-specific points as a separate current-week Team Manager signal; season value rankings remain a separate long-term signal. The local engine does not combine them into a lineup, waiver, or drop score. Weekly imports stop entering roster, available-player, readiness, and Codex evidence after three days; mixed position batches use the oldest position-file timestamp so a partial refresh cannot hide stale positions. A summary's `positions` lists every imported position file, including one that matched no players, while readiness counts only positions with matched players as loaded. Zero-match and header-only files remain coverage gaps with distinct warnings (no players matched or no rows), rather than missing-file warnings; the roster still labels their unprojected players "No match". Load repair restores imported positions and the singular position label consistently for older records. Sleeper's global `season_type` gates current-week context: preseason display weeks are never reused as regular-season fantasy matchup weeks.
10. Season value rankings are scoped to a league, season, and scoring format. Weekly projections are scoped to a league, season, and week. Stored historical or mismatched data cannot influence current advice.
11. The local engine evaluates import coverage, matching quality, format compatibility, player availability, and lineup feasibility. Its draft board uses a documented raw ordering of ECR, season projection, Sleeper ADP, Real-Time ADP, and finally Sleeper placeholder rank; it does not calculate a composite strategy score. Team Manager similarly exposes roster state plus separate weekly-projection, ROS ECR, and draft-ECR-fallback groups without a local add/drop, lineup, or roster-priority recommendation.
12. Real drafts open in a preparation workspace unless current matching ECR, season projections, Sleeper ADP, and a ready Codex provider are all present. There is no pre-draft bypass into a degraded assistant experience.
13. Once Sleeper reports that a draft is actively drafting, incomplete setup may use an explicit emergency board-only path. That path preserves live board tracking but does not mount AI recommendations or draft questions; completing setup returns the user to the normal assistant contract.
14. When Codex is configured, the AI strategist receives neutral league, roster, board, and raw player evidence rather than a local strategic lean.
15. The provider can call backend-owned, read-only tools against an immutable current-pick snapshot: `search_available_players` for bounded player retrieval, `compare_players` for named alternatives, and `inspect_position_market` for positional supply and tier depth. These tools expose raw facts without applying recommendation-engine filtering or assigning scores. Sleeper draft normalization also preserves the next two user-owned picks, traded-pick ownership, and keeper metadata; pick order follows the draft type: snake, linear, or snake with Sleeper's `reversal_round`. Market timing is labeled as exact Sleeper order, normal-snake fallback, or unsupported; an unknown draft type, or picks whose reported slots contradict the modeled order, are unsupported rather than guessed. Recommendations shown before the user's turn are contingent targets, and the renderer distinguishes elite fallers from alternatives whose imported market range is nearer the upcoming selection.
16. The backend validates the response pick, availability, exclusions, and player IDs; it also rejects choices that worsen a critical starter deficit or make an otherwise feasible required lineup impossible to complete.
17. Team Manager sends Codex the authoritative Sleeper starters and bench, slot eligibility, inferred available-player evidence, data readiness, matchup state, league activity, and labeled Sleeper roster/injury/practice/depth-chart metadata. The complete normalized available-player pool is enriched before the bounded weekly and season-value evidence groups are selected. The upstream `news_updated` value is carried only as metadata freshness and never represented as a sourced article. Codex makes the lineup, waiver, drop, and roster-priority judgments; deterministic code checks coverage and preserves raw facts rather than choosing a winner.
18. Draft SSE polling checks Sleeper draft metadata and pick contents every 2 seconds while drafting, every 5 seconds before the draft, and every 15 seconds after completion. Changed metadata or picks trigger a full rebuild using the fetched snapshot, including same-count commissioner corrections. A rebuild also runs at least every 30 seconds of successful polling to refresh traded picks and related context. Changed states are sent as snapshots. Transient failures preserve the last valid state and use bounded backoff from 5 to 30 seconds; the failure count resets only after the whole refresh succeeds. Renderer events expose only a generic upstream-safe error plus sync age.
19. While Team Manager is visible, the renderer refreshes its existing read-only aggregate every 60 seconds and when the app regains focus. The default projection and matchup context follows Sleeper's active fantasy week across rollover; an explicitly selected historical or future week stays pinned until it becomes active or the user changes it. Transient refresh failures preserve the last successful team state.
    The draft room is one decision-first workspace driven by a single derived mode (`draft-room.ts`). On the clock and approaching, it shows a pick strip, a shortlist in the Assistant's order, a needs line, and a composer that expands into the shared conversation lifecycle. Waiting, the two-round live board leads, with a watch line of still-available shortlist names. The needs line reuses the shared slot-assignment count and only reports filled and open slots. `draft-strategy-session.svelte.ts` owns the strategy request lifecycle across modes, so a mode change never loses the held list. The renderer computes availability from `state.picks` and only removes players from the Assistant's order; it never re-ranks. Emergency board-only mode mounts none of the Assistant surfaces.
    Team Manager keeps that aggregate in one daily workspace, in one 880px column: the top bar carries the league, week, matchup, scoring, refresh, and Manage data; an attention box comes next; then the lineup table, with reserves collapsed behind one row; a one-line composer that expands into the shared conversation lifecycle; and a market activity line that appears only when there is activity. Import controls and readiness detail live in the data-management drawer, which an attention item can open at the relevant control. `team-attention.ts` derives the attention box from the team payload through two rule tables: starter rules, where the first match wins so one starter raises one item, and lineup-data rules. It reports facts only and never compares players. The box has one of three states: items, all clear, or a note. Preseason and postseason always give a note. An unknown week, a week other than Sleeper's active one, or a failed refresh can never give all clear. A row's Ask control fills the composer without sending. The check is renderer-only: the readiness calculation and the Assistant's team context are unchanged.
    The renderer's `team-session.svelte.ts` module owns request ordering, mutually exclusive busy state, and refresh timestamps for team loads, imports, and clears. New operations supersede older callbacks; switching context, resetting, or unmounting invalidates pending work. `App.svelte` retains payload presentation and input validation, while chat remains in the separate shared conversation lifecycle and cannot overwrite roster state.
20. AI-first strategy and contextual questions use dedicated authenticated backend routes. Draft and Team Manager adapters share one renderer conversation lifecycle for message history, request identity, stale-response rejection, retry, copy, cancellation, and loading/error state while retaining domain-specific presentation. Both threads follow the newest message unless the reader has scrolled up. Structured strategy responses are tagged with the pick number they were asked about; the revision compares the full normalized state, excluding only its check timestamp, so same-count corrections also mark old strategy stale. A provider turn cannot be interrupted, so an answer the board overtook is still validated against the board it was asked about and returned, but it never becomes the stored plan or a decision snapshot. The renderer shows it with taken players struck and its source pick named until a newer answer lands. A change to preferences, guidance, or settings aborts in-flight requests instead, because those answers are wrong rather than late. Draft conversation history is retained for follow-up wording while the latest Sleeper snapshot remains authoritative, and the renderer marks prior answers when the board advances.
21. The backend keeps one Codex app-server subprocess per active provider configuration and communicates through the supported JSONL-over-stdio transport. Turns are serialized and reuse one ephemeral thread per draft/team scope while the API process is running. The selected Fast or Standard service tier is sent when each thread starts. The newest full draft or team snapshot is still sent on every turn; prior UI chat messages are omitted after thread reuse because app-server retains them. Changing provider settings, including response speed, or stopping the API closes the process and clears its thread map.
22. Each successful AI strategy includes a validated living draft plan with current and next-turn priorities, positions that can wait, roster goals, watch items, and a board-change summary. The latest plan is persisted by draft, team, and provider, then supplied as prior advisory strategy on the next AI turn.
23. Settings, imports, AI draft plans, strategy instructions, and decision snapshots are persisted locally in `app.sqlite`. SQLite schema evolution uses `PRAGMA user_version`; domain JSON evolution is independent and uses runtime-decoded `{ version, data }` records at store boundaries. Supported unversioned alpha records are rewritten to the current domain version on read. Unknown or corrupt records stop with non-sensitive clear/reset guidance instead of entering the application through unchecked casts. Each synchronous logical database action performs at most one owner-private atomic file replacement; a failed replacement restores the live sql.js database to its exact pre-action state before the error is returned. AI-triggered snapshots retain the validated structured strategy and living plan; the draft workspace collapses repeated same-pick plan shapes into a compact meaningful-change timeline without creating a second history store. Legacy recommendation-only snapshots remain readable.
24. User strategy guidance is persisted by draft and team. `next-pick` guidance expires after the draft advances; `draft` guidance remains active for the rest of that draft. AI conversation may return a structured proposal, but only an explicit renderer action can call the authenticated mutation route that applies it.
25. Authenticated data-management routes expose aggregate counts, category deletion, a typed-confirmation reset, and a support report that reduces decision history to non-identifying event metadata. A full reset advances an application data generation, closes active provider work, and clears every app-owned SQLite domain plus settings in one logical database action. Reset errors reconstruct store views from the actual database commit outcome; requests captured before reset cannot persist afterward.

## Persistence

Season-value CSV classification recognizes both verified Overall ROS header layouts, `SOS SEASON` / `SOS PLAYOFFS` / `ECR VS. ADP` and `SOS` / `PLAYOFFS` / `ECR VS ADP`, and the separate Overall Draft ECR signature. Recognized FantasyPros ADP headers are rejected with ADP-specific guidance to choose Overall ROS ECR or Overall Draft ECR instead. Detection uses the ADP rank, player, position, average, and platform-market headers, including the current `Player (Bye)` report layout and legacy `Player` exports. The [FantasyPros Overall ADP report](https://www.fantasypros.com/nfl/adp/overall.php) describes these market columns; tests retain only synthetic header fixtures. Missing expert-disagreement statistics remain null; schedule-star values are not repurposed as those statistics. See [actual ROS export validation](research/week-2-ros-availability-2026.md).

File replacement is the commit point. A failure before replacement rolls back the live database and import caches. If replacement succeeds but directory durability confirmation fails, `CommittedFileWriteError` preserves the committed state and returns safe retry guidance. Reset reconstructs store views from the database for either error outcome. It does not claim that already-replaced disk contents were rolled back.

Async mutations capture the local-data generation before awaiting input or Sleeper. They check that generation before writing, so a request started before reset cannot repopulate imports, settings, guidance, or decision history. Reset also invalidates existing draft streams.

Packaged runs use Electron's per-user data directory. Development defaults to repository `data/` or `SLEEPER_AI_DATA_DIR` when supplied. Writes use atomic replacement, reject symlink components observed during path validation, and use owner-only POSIX permissions. The path checks are defense in depth, not a race-proof boundary against another process running as the same OS user. Windows privacy depends on the user's profile ACLs.

Database schema versions and individual domain-record versions are intentionally separate. A newer database schema requires a compatible app update. A known legacy domain record migrates atomically when read; an unknown or malformed record is never guessed or partially converted.

The renderer can clear draft rankings, season projections, draft ADP, season value rankings, weekly projections, or decision history independently. A full reset also restores provider settings and removes app-owned renderer preferences before reload. The API reports reset success only after the atomic database replacement completes; pre-replacement failure preserves prior data, while a post-replacement durability error retains the new state and asks the user to retry. Exported support reports omit database contents, local paths, identifiers, names, recommendation text, imported values, and provider credentials.

## Provider boundary

Automatic draft strategy calls skip live news to stay inside a pick clock: the per-turn policy uses supplied Sleeper status metadata and discloses unchecked current news only when material. A defensive `unavailable` news stub starts no research, consumes no lookup allowance, and records no news phase or diagnostics. These turns receive zero extra news tool-wait budget. Typed questions and explicit Retry retain real news checks on the same thread when Web search is enabled.

The model-controlled `check_player_news` tool resolves a current-snapshot player ID and a bounded topic to an isolated public-only research prompt. Main strategy/chat threads explicitly disable hosted search; short-lived research clients enable live search for approved news domains. Both thread types explicitly disable built-in apps, plugins, browser and computer automation, shell and unified execution. Research additionally disables code-mode hosting, subagents, image tools, skill discovery and installation, hooks, goals, worktrees, tool suggestions, and sleep tools. Main threads retain the additional defaults because disabling the full set made dynamic tool results unreadable in a live codex-cli 0.163.0 probe. Main threads retain app-owned dynamic tools; research retains hosted search. Each of at most two lookups gets up to 45 seconds, capped by the configured main-turn timeout, including process startup. The main generation timer pauses during dynamic tools with a reference count for overlapping calls. For research-enabled questions and retries, a separate wall-clock timer caps the turn at the main timeout plus two lookup budgets, or 150 seconds by default. Without tool waits, the original generation timeout still applies. Sources on NFL.com, ESPN, the 32 official NFL team article hosts, and NBC Sports pass exact-host, URL, known rolling-listing rejection, and seven-day article-publication-date validation individually; invalid entries are dropped while valid dated sources return as advisory evidence and are shown separately. Current admission rejects valid full URL-path dates more than one day from the reported publication date, without changing stored-citation decoding. This corroborates NBC player-news URLs but cannot detect wrong years on undated article paths. The research prompt requires confirmation against the main article byline or article-level `datePublished` and forbids substituting crawl/current/practice/game or generic updated dates for publication. The latest 20 in-memory lookup diagnostics contain only outcome, elapsed milliseconds and bounded per-source rejection counts (`missing_date`, `malformed_date`, `future_date`, `stale_date`, `url_date_mismatch`, `rejected_host`, `undated_listing`, `invalid_source_shape`); empty responses record `no_sources_returned`. Copy diagnostics/support reports use detached count copies and retain no source URLs, titles or player identity. Research clients close on parent completion, failure, provider reset, or their own deadline. See [AI-controlled news lookup](AI_PROVIDERS.md#ai-controlled-news-lookup).

`AiProvider` keeps provider-specific behavior out of route and renderer code. Its draft strategy method returns a validated structured decision rather than prose:

- `noop`: narrow offline response used to preserve the provider contract; default and not rendered as draft advice.
- `codex-app-server`: supported local integration with a user-installed Codex CLI and required provider for normal real-draft assistant entry.

The provider-neutral `AiTool` boundary keeps draft search logic in the API domain layer. The Codex adapter maps those definitions to experimental app-server dynamic tools; future providers can expose the same read-only tools through their own function-calling protocol.

The Codex adapter uses app-server's default stdio transport. WebSocket transport is not exposed to the renderer or used as an authorization boundary. Process-scoped thread reuse provides continuity independently of the transport.

Executable configuration is limited to commands or paths ending in `codex`, `codex.exe`, or `codex.cmd`.
On Windows, npm launchers are resolved to their known `@openai/codex/bin/codex.js` entry point and `node.exe`; arbitrary shell execution is not enabled.

## Known architectural limits

- Persistence uses `sql.js`, so the database is exported after mutations rather than managed by a native SQLite service.
- The API is local single-user software; it is not designed for LAN or multi-user hosting.
- Signed installers are not implemented.
- Draft, ROS, and weekly values require user-downloaded CSV exports; there is no automatic FantasyPros feed. A connected draft import may be reused locally as draft ECR fallback.
- Auction pick timing is unsupported. Sleeper does not document `settings.reversal_round`, so third-round-reversal order is checked against reported pick slots on every rebuild. Synthetic or legacy snapshots without normalized Sleeper pick order use a labeled normal-snake fallback. Current pick is the lowest unmade overall pick number, capped at the final pick. Turn waits, remaining selections, and intervening teams exclude filled slots (including pre-filled keepers); recent picks exclude future keeper allocations. Keeper-specific valuation remains outside the current draft model. These are derived values: DraftState and persisted record formats are unchanged, so rollback to 0.1.1 needs no migration.
- IDP player values, auction budgets, and nomination strategy are not modeled.
- Custom scoring and TE-premium accuracy depends on importing values produced for the same format.
- Exact kicker and defense rescoring is unavailable when exports omit field-goal distance and points-allowed distributions.
- The capability token is not an IPC replacement and does not defend against same-user malware.

### Team Manager NFL schedule

Team Manager reads the tokenless, read-only `https://api.sleeper.app/schedule/nfl/regular/<season>` endpoint. This undocumented Sleeper endpoint receives only the season, with no league or roster data. A strictly validated complete 272-game season provides selected-week byes, NFL opponents, home/away and game status, plus season bye weeks for roster and available-player evidence. Codex remains responsible for start/sit advice; a known bye scores zero and cannot be recommended as a starter. Bye players are excluded from weekly projection coverage.

The API caches successful results in memory per season for six hours and unavailable results for two minutes, coalescing concurrent requests. Nothing is persisted or sent to a new host. Closing the app or deleting all local app data discards the cache; an in-flight request cannot restore a cleared cache. On network or validation failure Team Manager remains usable, shows schedule coverage as unavailable, falls back to imported draft CSV bye weeks only for current recognized NFL teams, and otherwise reports unknown bye status. Demo mode uses synthetic local evidence and makes no schedule request.

Schedule requests use a single 2.5-second attempt so an unavailable endpoint does not hold up Team Manager for long. Unknown bounded game-status strings become `unknown` without discarding the season. Free agents, teamless players and unrecognized teams have unknown bye status. Preseason and postseason views have no weekly schedule facts; an unknown phase requires an explicitly selected week.

## AI request lifecycle

The provider queue runs one main turn at a time, selecting user questions and
explicit strategy retries before pending automatic refreshes. Refreshes coalesce
by draft/team scope, retaining the highest caller priority. The queued phase is
reported only when another operation holds the provider queue; preparation and
freshness checks use thinking. A provider-neutral `AiRequestOptions` carries caller priority,
a preflight freshness check, and phase notifications. Strategy preflight checks
the normalized draft revision, reset generation, and caller cancellation before
model execution, so a queued turn for an old board never starts. A turn already
running finishes, and response validation remains authoritative afterward.

Authenticated request-progress middleware stores only an opaque request handle,
phase, and cancellation flag for the lifetime of the HTTP operation. The renderer
polls status while waiting, cancels queued work when its context is invalidated
or the user presses Cancel, and keeps its existing response identity guards. Cancellation never interrupts
an active turn. Settings changes and reset still close the provider and clear
threads. Diagnostics reduce the latest 20 completed main operations to request
kind and phase durations; no request handles or content reach either export.
See [AI providers](AI_PROVIDERS.md#ai-scheduling-and-progress) for phase meanings.

The synthetic demo schedules other teams' picks after 4.5 seconds and holds on
the user's pick for 45 seconds before its scripted selection. It derives the user
turn from the shared draft-timing rules. Stream cancellation clears its timeout;
reset generation invalidates the stream and completed drafts retain heartbeats.
Shared drawer focus restoration checks whether the opener remains usable. If a
live room mode change removed it, closing the drawer returns to the draft composer.

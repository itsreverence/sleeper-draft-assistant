# AI providers

Codex powers the core draft and Team Manager assistant experience. Every model decision is grounded in locally computed Sleeper state and imported evidence.

## No-provider mode

This is the default before Codex is configured. It makes no external AI request and requires no account, API key, or model installation. Data import and demo surfaces remain available, but real drafts cannot enter the normal assistant workspace. If Sleeper reports that a draft is already active, the user may explicitly open emergency board-only mode for live pick tracking; the renderer does not mount recommendation or draft-question features in that mode. A narrow backend fallback contract remains for offline reliability and tests; it is not a product strategy surface.

## Local Codex app-server

The supported provider runs a user-installed Codex CLI as a local subprocess and sends it a compact context prompt. The API reuses one app-server process for the active provider configuration and one ephemeral thread per draft/team scope while the app is running.

1. Install Codex CLI through its official instructions.
2. Run `codex login` or `codex login --device-auth` separately.
3. Open app **Settings**.
4. Select **Codex (local)** and save.

The app verifies the provider by starting the configured Codex session. Selecting Codex alone does not mean it is ready. If the CLI cannot start, the app shows **Needs attention** with actions to retry or open Settings. Known startup, login, model, and timeout failures return short recovery guidance without exposing local paths, configuration contents, or raw provider errors.

The executable setting accepts `codex`, `codex.exe`, `codex.cmd`, or a full path ending in one of those names. Arbitrary subprocess commands are rejected.

On Windows, a bare `codex` or npm `codex.cmd` launcher is resolved to the installed npm Codex JavaScript entry point and an explicit `node.exe`. If `codex.cmd` is not on the PATH the app inherited from Windows, even though a terminal finds it, the backend also checks npm's default global launcher at `%APPDATA%\npm\codex.cmd`. Other install locations need the full path in Settings. The backend does not enable shell execution. A configured Microsoft Store `codex.exe` path remains usable when Windows permits direct subprocess execution.

Development defaults are optional:

```bash
SLEEPER_AI_PROVIDER=codex-app-server \
SLEEPER_AI_CODEX_MODEL=gpt-5.6-terra \
SLEEPER_AI_CODEX_SERVICE_TIER=fast \
SLEEPER_AI_CODEX_TIMEOUT_MS=60000 \
CODEX_BIN=/path/to/codex \
npm run dev
```

The default model is `gpt-5.6-terra`, which balances intelligence and cost for repeated live-draft turns. Users can select `gpt-5.6-luna` for greater efficiency or `gpt-5.6-sol` for frontier capability. Model access still depends on the locally authenticated Codex account.

Fast responses are enabled by default because live draft turns are time-sensitive. OpenAI documents Fast as about 1.5× faster; GPT-5.6 and GPT-5.5 consume 2.5× ChatGPT credits while it is enabled. Users can switch to Standard in Settings. Changing the response speed restarts the local app-server provider and its ephemeral threads so the next turn uses the selected tier. See [Codex speed](https://learn.chatgpt.com/docs/agent-configuration/speed) for current availability and credit rates.

Codex installation, login state, model availability, subscription requirements, and provider terms remain the user's responsibility. This project is not endorsed by OpenAI.

If Codex previously worked but cannot start, update the CLI and run `codex login status` outside the app. On Windows, use `codex.cmd login status` when PowerShell execution policy blocks the npm-generated `codex.ps1` shim; the app itself resolves the npm launcher through Node without changing PowerShell policy.

## Provider boundary

Renderer code never stores provider credentials or contacts an AI provider directly. `AiProvider` adapters live in the local API and receive a focused context packet rather than the entire player database. Provider failures must be returned as bounded, redacted application errors.

The adapter uses app-server's supported JSONL-over-stdio transport rather than its experimental WebSocket listener. App-server threads, not WebSockets, provide conversation continuity. Follow-up turns reuse the scoped thread and omit duplicated UI conversation history; the newest complete draft or team snapshot is still included because live state can change between turns. Threads are process-scoped and intentionally ephemeral, so restarting the API starts fresh provider threads.

## AI-first draft strategy

When Codex app-server is configured, the app automatically requests strategy near the user's turn. The model receives neutral facts: league and scoring settings, current and next-pick timing, remaining selections, roster counts and open slots, recent and aggregate positional drafting, teams selecting before the next turn, user preferences, data coverage, and grouped player evidence. The primary strategy packet does not include a local strategic lean, composite score, qualitative value labels, return-probability estimate, or engine-authored strategy reasons.

Real drafts enter the AI workspace only after current ECR, season projections, Sleeper ADP, and Codex are ready. There is no pre-draft bypass and no reduced-evidence AI mode. After a draft becomes active, emergency board-only recovery can preserve live pick tracking, but AI strategy and draft questions remain disabled until setup is complete.

The prompt contains one alphabetically ordered, deduplicated player catalog plus separate ID groups for pinned targets, ECR leaders, season-projection leaders, Sleeper ADP leaders, Real-Time ADP leaders, Sleeper search-rank placeholders, and position coverage. A signal group contains only players with that signal. Ordering within a signal group reflects only that raw signal; catalog order is explicitly not a recommendation.

The Codex adapter exposes provider-neutral, read-only dynamic tools:

- `search_available_players`: searches the immutable player pool captured at the current pick. It supports position, name, exact tier, result limit, and sorting by ECR, season projection, Sleeper ADP, Real-Time ADP, or Sleeper search-rank placeholder. Results contain raw evidence and user preference markers, not local recommendation scores.
- `compare_players`: compares two to six known player IDs and reports raw evidence plus available, drafted, or excluded status without selecting a winner.
- `inspect_position_market`: reports available counts, imported tier depth, drafted counts, and teams selecting before the next user turn for one to three positions. It labels timing as `sleeper`, `normal_snake_fallback`, or `unsupported`; the AI must qualify exact wait-or-take claims when the source is not `sleeper`.

Dynamic tools are experimental in Codex app-server, so the protocol handling remains isolated inside the experimental adapter. Tool calls are limited to six per AI turn and twenty results per search.

The response is strict structured JSON containing one recommended player ID, alternatives, confidence, reasons, risks, next-position priorities, and a complete living draft plan. When the user is not on the clock, the recommendation is a contingent target for the next user-owned pick; the context includes the following user-owned pick and the number of intervening selections so snake-turn pairs are not described ambiguously. Alternatives should mix elite fallers with credible turn-range contingencies rather than assuming every current top option survives the wait. The plan records the current approach, current and next-turn positional focus, positions that can wait, roster goals, watch items, and the material change since the prior plan. Strategy requests can run automatically near the user’s turn when entering the draft workspace or when the board, player preferences, saved guidance, or provider search setting changes. A retry also requests new strategy. Ordinary questions and opening the plan drawer do not themselves request a plan update. The latest successful plan is stored locally by draft, team, and provider and supplied to the next AI turn as advisory strategy; the current Sleeper snapshot always remains authoritative.

Sleeper draft normalization includes the draft's pick-to-roster order and traded-pick ownership when the upstream draft is a supported non-auction format. Keeper metadata is preserved on completed picks. Older or synthetic snapshots without that data use a labeled normal-snake fallback, while auction timing is marked unsupported.

Users can add concise `next-pick` or `draft` strategy guidance. Active guidance is included as preference-level context in strategy, conversation, and candidate-evaluation turns. It can influence a decision when reasonable, but it does not override availability, exclusions, roster feasibility, or the current Sleeper snapshot.

The backend rejects stale pick numbers, excluded or unavailable players, unknown IDs, lineup-infeasible choices, and plans tagged for a different pick. Alternatives receive the same validation. The renderer discards responses after the board advances and shows explicit reviewing, unavailable, or not-configured states when no current AI strategy exists.

AI strategy cannot submit a Sleeper pick. The Codex thread is ephemeral, read-only, uses no approval flow, and is instructed to use supplied evidence and bounded fantasy tools. Direct web search is explicitly disabled on strategy and conversation threads. Both main and research threads disable built-in apps, plugins, browser and computer automation, shell and unified execution. Research additionally disables code-mode hosting, subagents, image tools, skill discovery and installation, hooks, goals, worktrees, tool suggestions, and sleep tools. Research retains hosted web search. A live codex-cli 0.163.0 probe confirmed that the main restrictions preserve app-owned dynamic tool results. Applying the full research restriction set to main threads made those results unreadable, so the additional flags remain research-only. Main threads remain instructed to use only supplied evidence and app-owned tools. The feature keys were checked with `codex features list` on codex-cli 0.163.0 and are asserted in the provider tests.

## Contextual draft conversation

**Ask about this draft**, suggested questions, and candidate-card **Ask about pick** actions use the same neutral draft evidence and draft tools as primary strategy. Candidate actions seed the shared conversation instead of creating a separate response inside each player card.

The conversation supports comparisons, challenges to the current plan, and what-if analysis. Conversation history is included only to resolve follow-up wording; the current draft snapshot remains authoritative. When the board advances, the renderer marks earlier answers as coming from an older board while new questions use the latest pick, roster, availability, and imported evidence.

When a user explicitly asks the conversation to adopt or change draft strategy, the provider may append a validated strategy proposal. Candidate-comparison actions explicitly request such a proposal when the answer overturns the primary recommendation, preventing contradictory advice from silently remaining beside the main call. The proposal is displayed separately from the answer and is not active until the user selects **Apply to strategy**. Provider tools remain read-only and cannot persist guidance directly.

Draft questions are grounded in the current roster, board, league settings, separate rank/projection/ADP evidence, and imported-data limitations. The model can search the complete immutable available-player snapshot for positional or named alternatives. Optional news lookups supplement this context without adding a local strategic lean or score.

## AI-controlled news lookup

Codex may call `check_player_news` when injury, practice, or role reporting could materially change an answer or draft decision. No separate user search button is required. The tool accepts only a player ID from the current supplied evidence and one of those three topics, never arbitrary search text. The backend constructs a public-only prompt containing name, NFL team, position, topic, and current timestamp, without league identifiers, the user's question, or imported values.

**Settings > AI > Web search** controls this capability and defaults on, including when upgrading older settings. Turning it off and saving immediately closes the old provider and active research clients, removes the news tool, and starts fresh draft/team conversations. Normal roster and imported-data analysis remains available. The setting persists locally; a full local-data reset restores the enabled default. Existing saved draft decisions/history are not deleted, but their news is not treated as current evidence when search is off.

Each lookup uses a separate ephemeral Codex process/thread with live hosted search restricted to NFL.com, ESPN, all 32 official NFL team sites, and NBC Sports. Research applies the full built-in tool restrictions described above, uses a read-only sandbox and never requests approval. Live hosted search and the existing news-domain filter remain enabled. At most two lookups are allowed per answer. Each gets the smaller of 45 seconds and the configured main-turn timeout, including process startup. The main generation timer pauses while dynamic tools execute, including overlapping calls. A separate wall-clock deadline bounds the turn to the configured timeout plus two lookup budgets. With the default 60-second timeout, the turn can take at most 150 seconds; a turn without tool waits still times out after 60 seconds. Closing or failing the parent turn closes research clients. Unsupported search configuration, failed retrieval, missing citations, and invalid source links return a safe evidence gap so Codex can continue. Source structure and URL allowlisting do not prove that an article or claim is accurate.

Copy diagnostics and support reports include the latest 20 lookup outcomes and elapsed milliseconds for the current provider session. Outcomes distinguish `available`, `timeout`, `cancelled`, `provider_error`, `invalid_json`, `invalid_response`, `invalid_source`, `invalid_date`, and `no_sources_returned`. An empty list means no lookup completed in that session; it does not prove search succeeded. Each entry also contains `rejectedSources`, counts by `missing_date`, `malformed_date`, `future_date`, `stale_date`, `url_date_mismatch`, `rejected_host`, `undated_listing`, and `invalid_source_shape`. Each source receives its first failing reason; at most three sources are counted per lookup. Counts are retained even when another source succeeds. `no_sources_returned` replaces the former in-memory `no_recent_sources` category; there are no stored diagnostics to migrate. Returned diagnostic copies detach the nested counts. Diagnostics retain no player identity, prompt, article, URL, or raw provider error and never launch Codex just to inspect the list.

Answers append the sources checked, report dates, and retrieval timestamps. Each source must pass the unchanged exact-host and URL checks and have a valid article publication date within the preceding seven days, not a future or unknown date. The prompt requires the article’s own publication date, never crawl time, today’s date, a practice/game date, or a generic page-updated date. Rolling injury reports, rosters, depth charts, transaction lists and player profiles are not standalone citations: research must find a dated article or return no sources. Current lookups apply conservative URL-path checks to reject known rolling routes even with a plausible date: NFL `/injuries/`, `/transactions/`, `/players/` and `/teams/<team>/{roster,depth-chart,injuries}`, ESPN `/nfl/player/`, `/nfl/players`, `/nfl/team/{roster,depth,injuries}/` and listing routes, team `/team/injury-report`, `/roster`, `/depth-chart`, `/transactions` (also directly under `/`), and NBC `[/nfl]/<slug>/<numeric-or-UUID-id>` profiles (including `/news` and `/stats`), the player-news index and PFT landing/rumor-mill indexes (including team indexes). Exact NFL and team `/news` indexes and the verified 49ers `/news/morning-report` and `/news/roster-news` indexes are also rejected; article paths beneath `/news/<slug>` remain eligible. Historical saved citations remain decodable; the new path rule applies when admitting current research, so it does not invalidate stored draft history. Before returning no sources, research searches team `/news/` injury, practice and roster-move reports, NFL `/news/`, ESPN `/nfl/story/`, and NBC/PFT articles. A dated per-game injury report is citable; a rolling report page is not. Dated articles such as `/news/nfl-week-8-injury-report-2026-season` and NBC’s dated player-news articles remain eligible. Invalid sources are dropped individually. A lookup returns an evidence gap only when no valid recent dated source remains. An empty sources array records `no_sources_returned`; sources that all fail schema or URL validation record `invalid_source`; structurally valid sources with no acceptable date record `invalid_date`. The tool warns that summary claims outside the retained sources are unverified. Current admission also extracts valid full calendar dates from URL path segments (`/YYYY-MM-DD/` or `/YYYY/MM/DD/`); a difference from `reportedAt` of more than one day rejects that source as `url_date_mismatch`. Invalid path dates and year-only slugs are not publication evidence. This check leaves stored citations decodable. Among the verified publisher URL shapes, it covers only NBC player-news citations: it would not have caught the round-2 NFL.com wrong-year citation because that URL has no publication date. The prompt asks the model to confirm year, month and day against the main article’s byline or `datePublished`, ignore sidebar, related-story and page-level dates, and use null if the year cannot be confirmed. Prompt compliance remains probabilistic; this does not independently verify article truth. Draft sources appear under **Why**. HTTPS links open externally only for the approved news hosts; in-app navigation remains blocked. News is advisory and cannot establish fantasy availability, override lineup validation, or replace rankings/projections. Old conversation reports must be rechecked before treating them as current. Current request UI shows the ordinary reviewing state; per-search streaming progress is not implemented.

The research prompt uses the same exact host list as citation validation. Search domain filters may return other subdomains; the researcher must retrieve an approved-host article before citing it, never merely rewrite the returned URL.

Approved source hosts are exactly `nfl.com`, `www.nfl.com`, `amp.nfl.com`, `espn.com`, `www.espn.com`, `www.nbcsports.com`, and these official team article hosts, verified against the [NFL team directory](https://www.nfl.com/teams/) and live HTTPS article retrieval on October 29, 2026:

- `www.azcardinals.com`
- `www.atlantafalcons.com`
- `www.panthers.com`
- `www.chicagobears.com`
- `www.dallascowboys.com`
- `www.detroitlions.com`
- `www.packers.com`
- `www.therams.com`
- `www.vikings.com`
- `www.neworleanssaints.com`
- `www.giants.com`
- `www.philadelphiaeagles.com`
- `www.49ers.com`
- `www.seahawks.com`
- `www.buccaneers.com`
- `www.commanders.com`
- `www.baltimoreravens.com`
- `www.buffalobills.com`
- `www.bengals.com`
- `www.clevelandbrowns.com`
- `www.denverbroncos.com`
- `www.houstontexans.com`
- `www.colts.com`
- `www.jaguars.com`
- `www.chiefs.com`
- `www.raiders.com`
- `www.chargers.com`
- `www.miamidolphins.com`
- `www.patriots.com`
- `www.newyorkjets.com`
- `www.steelers.com`
- `www.tennesseetitans.com`

The Eagles article responses use `www.philadelphiaeagles.com` even though their canonical metadata currently points to the site homepage. ProFootballTalk’s legacy `profootballtalk.nbcsports.com` host redirects to `www.nbcsports.com/nfl/profootballtalk`. Its canonical articles use `/nfl/profootballtalk/rumor-mill/news/<slug>` with displayed publication dates and `datePublished` metadata, so they are already eligible on `www.nbcsports.com`; no extra host is needed. Other NBC subdomains remain rejected. Rotoworld redirects to NBC Sports, so no separate Rotoworld host is allowed. This is not a wildcard subdomain allowance; credentials, non-HTTPS URLs, and nonstandard ports remain rejected in source validation and Electron’s external-link handler.

## AI-first Team Manager

Team Manager follows the same ownership rule as the draft assistant: deterministic code supplies evidence and safety facts, while Codex owns strategic judgment. The model receives the current Sleeper starters and bench, slot eligibility, roster counts, current matchup state, league activity, readiness warnings, and inferred available players. Available players are grouped by separate raw weekly-projection, ROS ECR, draft-ECR-fallback, and positional-retrieval signals; the catalog is alphabetical and no composite score or local winner is supplied.

The local engine does not choose lineup swaps, waiver additions, drops, weakest positions, or roster priorities. Codex must verify that a proposed starter is rostered and slot-eligible, that an addition appears in the inferred available-player evidence, and that a proposed drop is on the user's roster. Missing or partial weekly and season-value data must lower confidence rather than triggering rank-based fallback advice. Draft ECR fallback is always identified as provisional and never presented as ROS evidence.

The renderer keeps the contextual Codex command bar and actual Sleeper roster primary. The command bar expands into the full conversation after a question, the roster heading keeps matchup and data readiness visible, imports remain one action away, and league activity is available through a compact disclosure. When Codex is unavailable, Team Manager does not substitute a deterministic recommendation.

## AI scheduling and progress

Codex keeps one active main turn. User questions in either workspace and explicit
strategy retries run before queued automatic strategy refreshes; an active turn is
never preempted. Pending refreshes coalesce by draft/team scope, rejecting older
callers with a safe 409 response and keeping the highest priority among the
coalesced requests. Before execution, strategy refreshes recheck the
normalized draft revision, reset generation, and request cancellation. Existing
response guards still reject stale results. Thread reuse and provider cleanup on
settings changes, reset, and shutdown remain in place.

The renderer polls `GET /ai/requests/:requestId` only during its active request,
using an opaque random handle in `X-AI-Request`. Like every non-health route, status
and `DELETE /ai/requests/:requestId` require the per-launch capability token.
Status returns only `queued`, `thinking`, `news`, or null after cleanup; it never
returns prompts, player names, queries, or answer text. The existing live regions
announce “Thinking…” initially, “Waiting for another AI request…” only when the
provider is waiting behind another operation, and “Checking news…” during news lookup.
Context changes/unmount cancel queued work and stop polling without interrupting an
already-running model turn or admitting its result into the new context.

Copy diagnostics and support reports include `aiTimings`, the latest 20 completed
main operations in this provider session. Entries contain only the request kind
(`draft_strategy`, `draft_question`, `team_question`) and elapsed milliseconds:
`queueMs` includes queue wait and the preflight freshness check (a Sleeper fetch
for strategy refreshes); `modelMs` includes startup and
thread setup but excludes dynamic-tool wait, `toolMs` is the union of dynamic-tool
intervals, and `newsMs` is the news-tool subset of that wait. These are wall-clock
phase measurements, not model CPU time. Errors during turns are counted; skipped
requests and startup failures have no completed-turn entry. Provider replacement
or reset discards the in-memory history. No content or identifiers are retained.

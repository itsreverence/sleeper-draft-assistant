# AI providers

AI is optional. Draft strategy is AI-first when Codex is configured, but every model decision is grounded in locally computed Sleeper state and imported evidence.

## No-provider mode

This is the default when no provider is configured. It makes no external AI request and requires no account, API key, or model installation. Draft tracking, imports, and roster context remain available, but the renderer does not present a local pick recommendation. A narrow backend fallback contract remains for offline reliability and tests; it is not a product strategy surface. Hard feasibility checks remain active when validating AI choices.

## Local Codex app-server

The supported optional provider runs a user-installed Codex CLI as a local subprocess and sends it a compact context prompt. The API reuses one app-server process for the active provider configuration and one ephemeral thread per draft/team scope while the app is running.

1. Install Codex CLI through its official instructions.
2. Run `codex login` or `codex login --device-auth` separately.
3. Open app **Settings**.
4. Select **Codex app-server** and save.

The executable setting accepts `codex`, `codex.exe`, `codex.cmd`, or a full path ending in one of those names. Arbitrary subprocess commands are rejected.

On Windows, a bare `codex` or npm `codex.cmd` launcher is resolved to the installed npm Codex JavaScript entry point and an explicit `node.exe`. The backend does not enable shell execution. A configured Microsoft Store `codex.exe` path remains usable when Windows permits direct subprocess execution.

Development defaults are optional:

```bash
SLEEPER_AI_PROVIDER=codex-app-server \
SLEEPER_AI_CODEX_MODEL=gpt-5.4 \
SLEEPER_AI_CODEX_TIMEOUT_MS=60000 \
CODEX_BIN=/path/to/codex \
npm run dev
```

Codex installation, login state, model availability, subscription requirements, and provider terms remain the user's responsibility. This project is not endorsed by OpenAI.

## Provider boundary

Renderer code never stores provider credentials or contacts an AI provider directly. `AiProvider` adapters live in the local API and receive a focused context packet rather than the entire player database. Provider failures must be returned as bounded, redacted application errors.

The adapter uses app-server's supported JSONL-over-stdio transport rather than its experimental WebSocket listener. App-server threads, not WebSockets, provide conversation continuity. Follow-up turns reuse the scoped thread and omit duplicated UI conversation history; the newest complete draft or team snapshot is still included because live state can change between turns. Threads are process-scoped and intentionally ephemeral, so restarting the API starts fresh provider threads.

## AI-first draft strategy

When Codex app-server is configured, the app automatically requests strategy near the user's turn. The model receives neutral facts: league and scoring settings, current and next-pick timing, remaining selections, roster counts and open slots, recent and aggregate positional drafting, teams selecting before the next turn, user preferences, data coverage, and grouped player evidence. The primary strategy packet does not include a local strategic lean, composite score, qualitative value labels, return-probability estimate, or engine-authored strategy reasons.

Real drafts normally enter the AI workspace after current ECR is imported. Season projections and ADP are recommended additional signals. An explicit limited-data path remains available for draft-clock recovery; the AI still receives the data limitations and the renderer keeps the quality warning visible.

The prompt contains one alphabetically ordered, deduplicated player catalog plus separate ID groups for pinned targets, ECR leaders, season-projection leaders, Sleeper ADP leaders, Real-Time ADP leaders, Sleeper search-rank placeholders, and position coverage. A signal group contains only players with that signal. Ordering within a signal group reflects only that raw signal; catalog order is explicitly not a recommendation.

The Codex adapter exposes provider-neutral, read-only dynamic tools:

- `search_available_players`: searches the immutable player pool captured at the current pick. It supports position, name, exact tier, result limit, and sorting by ECR, season projection, Sleeper ADP, Real-Time ADP, or Sleeper search-rank placeholder. Results contain raw evidence and user preference markers, not local recommendation scores.
- `compare_players`: compares two to six known player IDs and reports raw evidence plus available, drafted, or excluded status without selecting a winner.
- `inspect_position_market`: reports available counts, imported tier depth, drafted counts, and teams selecting before the next user turn for one to three positions. It labels timing as `sleeper`, `normal_snake_fallback`, or `unsupported`; the AI must qualify exact wait-or-take claims when the source is not `sleeper`.

Dynamic tools are experimental in Codex app-server, so the protocol handling remains isolated inside the experimental adapter. Tool calls are limited to six per AI turn and twenty results per search.

The response is strict structured JSON containing one recommended player ID, alternatives, confidence, reasons, risks, next-position priorities, and a complete living draft plan. The plan records the current approach, current and next-turn positional focus, positions that can wait, roster goals, watch items, and the material change since the prior plan. The latest successful plan is stored locally by draft, team, and provider and supplied to the next AI turn as advisory strategy; the current Sleeper snapshot always remains authoritative.

Sleeper draft normalization includes the draft's pick-to-roster order and traded-pick ownership when the upstream draft is a supported non-auction format. Keeper metadata is preserved on completed picks. Older or synthetic snapshots without that data use a labeled normal-snake fallback, while auction timing is marked unsupported.

Users can add concise `next-pick` or `draft` strategy guidance. Active guidance is included as preference-level context in strategy, conversation, and candidate-evaluation turns. It can influence a decision when reasonable, but it does not override availability, exclusions, roster feasibility, or the current Sleeper snapshot.

The backend rejects stale pick numbers, excluded or unavailable players, unknown IDs, lineup-infeasible choices, and plans tagged for a different pick. Alternatives receive the same validation. The renderer discards responses after the board advances and shows explicit reviewing, unavailable, or not-configured states when no current AI strategy exists.

AI strategy cannot submit a Sleeper pick. The Codex thread is ephemeral, read-only, uses no approval flow, and is instructed to use only supplied evidence and these bounded draft tools.

## Contextual draft conversation

**Ask about this draft**, suggested questions, and candidate-card **Ask about pick** actions use the same neutral draft evidence and draft tools as primary strategy. Candidate actions seed the shared conversation instead of creating a separate response inside each player card.

The conversation supports comparisons, challenges to the current plan, and what-if analysis. Conversation history is included only to resolve follow-up wording; the current draft snapshot remains authoritative. When the board advances, the renderer marks earlier answers as coming from an older board while new questions use the latest pick, roster, availability, and imported evidence.

When a user explicitly asks the conversation to adopt or change draft strategy, the provider may append a validated strategy proposal. The proposal is displayed separately from the answer and is not active until the user selects **Apply to strategy**. Provider tools remain read-only and cannot persist guidance directly.

Draft questions are grounded in the current roster, board, league settings, separate rank/projection/ADP evidence, and imported-data limitations. The model can search the complete immutable available-player snapshot for positional or named alternatives. The prompt does not include a local strategic lean or score, and the model does not receive or claim live news outside the supplied draft context.

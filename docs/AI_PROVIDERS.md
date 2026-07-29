# AI providers

AI is optional. Draft strategy is AI-first when Codex is configured, but every model decision is grounded in locally computed Sleeper state and imported evidence.

## Deterministic fallback

This is the default when no provider is configured. It makes no external AI request and requires no account, API key, or model installation. It supplies an immediate shortlist and remains the live fallback if Codex is slow or unavailable.

## Local Codex app-server

The supported optional provider runs a user-installed Codex CLI as a local subprocess and sends it a compact context prompt.

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

## AI-first draft strategy

When Codex app-server is configured, the app automatically requests strategy near the user's turn. The model receives neutral facts: league and scoring settings, current and next-pick timing, remaining selections, roster counts and open slots, recent and aggregate positional drafting, teams selecting before the next turn, user preferences, data coverage, and a neutral initial player pool. The primary strategy packet does not include the fallback engine's lean, composite score, confidence, qualitative value labels, return-probability estimate, or engine-authored reasons.

The initial pool is a union of raw ECR, season projection, Sleeper ADP, open-position, and pinned-player retrieval. Its order is explicitly not a recommendation.

The Codex adapter exposes one provider-neutral, read-only dynamic tool:

- `search_available_players`: searches the immutable player pool captured at the current pick. It supports position, name, exact tier, result limit, and sorting by ECR, season projection, Sleeper ADP, or Real-Time ADP. Results contain raw evidence and user preference markers, not local recommendation scores.

Dynamic tools are experimental in Codex app-server, so the protocol handling remains isolated inside the experimental adapter. Tool calls are limited to six per strategy turn and twenty results per search.

The response is strict structured JSON containing one recommended player ID, alternatives, confidence, reasons, risks, and next-position priorities. The backend rejects stale pick numbers, excluded or unavailable players, unknown IDs, and lineup-infeasible choices. Alternatives receive the same validation. The renderer discards responses after the board advances and shows the local fallback while the model is working or unavailable.

AI strategy cannot submit a Sleeper pick. The Codex thread is ephemeral, read-only, uses no approval flow, and is instructed to use only supplied evidence and the fantasy player-search tool.

## Candidate questions

When Codex app-server is configured, the lead draft candidate exposes an **AI take** action. Other candidates expose the same action inside their Details view.

Candidate evaluation remains available for follow-up analysis and is:

- on demand by default, so it does not add model latency to normal draft refreshes;
- grounded in the current deterministic recommendation, roster construction, league settings, and imported-data limitations;
- validated by the backend so unavailable or no-longer-recommended players cannot be evaluated from stale UI state;
- tied to the current pick number and marked stale when the board advances;
- advisory and separate from the primary structured AI strategy.

The model is explicitly asked for a Prefer, Reasonable, or Avoid verdict, concise reasons, the strongest listed alternative, next positional priorities, disagreement with the engine, and data limitations. It does not receive or claim live news outside the supplied draft context.

# AI providers

AI is optional. Draft and team recommendations always begin with deterministic application state and evidence.

## Deterministic fallback

This is the default. It makes no external AI request and requires no account, API key, or model installation. Use it for demo mode, offline use, testing, and any workflow where explainable local signals are sufficient.

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

## Candidate evaluation

When Codex app-server is configured, the lead draft candidate exposes an **AI take** action. Other candidates expose the same action inside their Details view.

Candidate evaluation is:

- on demand; it does not add model latency to normal draft refreshes;
- grounded in the current deterministic recommendation, roster construction, league settings, and imported-data limitations;
- validated by the backend so unavailable or no-longer-recommended players cannot be evaluated from stale UI state;
- tied to the current pick number and marked stale when the board advances;
- advisory only and never replaces deterministic candidate ordering or evidence.

The model is explicitly asked for a Prefer, Reasonable, or Avoid verdict, concise reasons, the strongest listed alternative, next positional priorities, disagreement with the engine, and data limitations. It does not receive or claim live news outside the supplied draft context.

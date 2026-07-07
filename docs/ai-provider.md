# AI Provider Setup

The app routes draft questions through a backend `AiProvider` boundary. Frontend code never talks to Codex, ChatGPT, or OpenAI directly.

## Configure in the app

Open **Settings** in the top bar, choose an AI provider, and save. Settings are stored by the local backend in `app-settings.json` under the app data directory.

Environment variables are still supported as initial defaults for development and packaged troubleshooting, but users should not need to set system-wide env vars.

## Providers

### `noop` default

No external AI is called. The backend answers from deterministic draft context and recommendation signals.

### `experimental-codex-backend` preferred subscription-backed experiment

Calls the ChatGPT Codex backend used by `ha-codex-assist` from the local backend. It uses the Codex device-code OAuth flow and stores tokens only in the backend data directory.

Flow:

1. Open Settings.
2. Choose `Experimental Codex backend`.
3. Click `Start Codex login`.
4. Open the shown verification URL and enter the displayed code.
5. Click `I approved login`.

This path is useful because it behaves more like a direct model/conversation backend than `codex app-server`. It is also riskier because the upstream ChatGPT Codex backend is not a stable public product API.

### `codex-app-server` experimental official-surface fallback

Runs the official local Codex app-server from the backend and sends it a compact draft-context prompt.

Prerequisites:

1. Install Codex CLI on the machine running the backend.
2. Sign in locally with ChatGPT subscription access using `codex login` or `codex login --device-auth`.
3. Open Settings and choose `Codex app-server`.

Optional development defaults:

```powershell
$env:SLEEPER_AI_PROVIDER = "codex-app-server"
$env:SLEEPER_AI_CODEX_MODEL = "gpt-5.4"
$env:SLEEPER_AI_CODEX_TIMEOUT_MS = "60000"
$env:CODEX_BIN = "C:\\path\\to\\codex.exe"
npm run dev
```

## Why this route

Current Codex documentation describes `codex app-server` and the Codex SDK as the supported local/programmatic integration surfaces. `ha-codex-assist` proves a subscription-backed device-code/backend pattern is possible, but it calls ChatGPT Codex backend endpoints directly and explicitly warns that upstream compatibility can change.

For this app, keep provider-specific auth and request behavior behind `AiProvider`. The app should prefer `ExperimentalCodexBackendProvider` for fantasy-football Q&A if it works reliably, keep `CodexAppServerProvider` as the official-surface fallback, and add `OpenAiApiProvider` later for API-key billing.

## Current backend files

- `apps/api/src/ai/types.ts`: provider interface and context types
- `apps/api/src/ai/context.ts`: draft context packet builder
- `apps/api/src/ai/noop-provider.ts`: deterministic fallback provider
- `apps/api/src/ai/experimental-codex-auth.ts`: device-code auth and backend token store
- `apps/api/src/ai/experimental-codex-backend-provider.ts`: experimental ChatGPT Codex backend adapter
- `apps/api/src/ai/codex-app-server-provider.ts`: experimental app-server adapter
- `apps/api/src/ai/provider-factory.ts`: settings-based provider selection
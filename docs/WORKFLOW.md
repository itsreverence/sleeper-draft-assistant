# Development workflow

## Prerequisites

- Node.js 22.12 or later
- npm 11.x
- Optional: Codex CLI for the local app-server provider
- Windows when validating Windows installers

## Setup and development

```bash
npm ci
npm run dev
```

The development launcher creates one random API token and passes it to both the API and Vite. Use `http://127.0.0.1:5173` and choose **Load demo draft** for a synthetic-data smoke test.

Running the API or web workspace separately requires coordinating `SLEEPER_AI_API_TOKEN` and `VITE_SLEEPER_AI_API_TOKEN`; the root launcher is the supported path.

## Canonical validation

```bash
npm run check
npm test
npm run build
npm audit
git diff --check
```

## Desktop

```bash
npm run desktop
npm run desktop:package
npm run desktop:make
```

`desktop:package` creates an unpacked application for the current platform. Do not report a Linux package as Windows evidence. Windows CI checks the unpacked executable; a clean Windows first-run test remains required before publishing an installer.

## API security smoke

Start with disposable data and a known test token:

```bash
SLEEPER_AI_DATA_DIR=/tmp/sda-smoke \
SLEEPER_AI_API_TOKEN=replace-with-a-long-random-test-token \
PORT=18787 npm run dev -w @sleeper-draft-assistant/api
```

In another shell, confirm:

- the listener is `127.0.0.1:18787`, not `*:18787`;
- `/health` succeeds without authentication;
- `/diagnostics` returns `401` without a token;
- `/diagnostics` succeeds with `Authorization: Bearer …`;
- a foreign origin does not receive permissive CORS headers;
- created data directories/files are `0700`/`0600` on POSIX.

Delete the disposable directory afterward. Never paste production tokens into shell history or issue reports.

## Troubleshooting

- **Port already in use:** close the prior development or desktop process; the app intentionally refuses to attach to an API that cannot prove possession of its token.
- **Web requests return 401:** use the root `npm run dev` launcher so renderer and API receive the same token.
- **Codex cannot start:** verify the configured executable is `codex`, `codex.exe`, or `codex.cmd`, then run `codex login` separately.
- **Windows package output is locked:** close all Sleeper Draft Assistant processes and retry.
- **Recommendations warn about placeholder values:** import a current rankings CSV for the league's scoring format.
- **Weekly advice has no projection data:** import all six FantasyPros position exports for the selected season and week in Team Manager.
- **Historical projections are inactive:** confirm the selected season and week match the connected league before evaluating lineup or waiver advice.

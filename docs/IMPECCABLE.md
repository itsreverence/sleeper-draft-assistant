# Impeccable UI Workflow

This repository keeps the durable Impeccable context for the project, while the
local skill bundle and hook runtime stay developer-local. Codex or GitHub
Copilot can use [`PRODUCT.md`](../PRODUCT.md) for product context and
[`DESIGN.md`](../DESIGN.md) for the shared visual system after Impeccable is
installed in that environment.

## Normal UI Work

The design hook runs after UI edits when the local Impeccable integration is
installed and enabled. Local hook settings live in
`.impeccable/config.local.json` and are ignored by Git.

## Live Mode

Start the app first:

```powershell
npm run dev
```

Then boot Live Mode for the Svelte app:

```powershell
node .agents/skills/impeccable/scripts/live.mjs --target apps/web/src/App.svelte
```

Open `http://127.0.0.1:5173/` and follow the `_instructions` returned by the
Live Mode commands, including the foreground poll loop. Stop the helper when
finished:

```powershell
node .agents/skills/impeccable/scripts/live-server.mjs stop
```

Vite adds the helper origin only to development HTML responses; the packaged
app keeps the strict CSP in `apps/web/index.html` unchanged. Live session state
and helper configuration are intentionally local and ignored by Git.

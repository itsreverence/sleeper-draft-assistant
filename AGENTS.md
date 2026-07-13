# Agent guidance

## Scope

Keep changes narrowly relevant to Sleeper Draft Assistant. This is active alpha software, not an archived portfolio project.

## Required reading

Before implementation, read `README.md`, `docs/ARCHITECTURE.md`, `docs/WORKFLOW.md`, and any domain-specific document affected by the change.

## Boundaries

- Preserve the local-first design.
- Keep the API bound to loopback and require the per-launch capability token for every non-health route.
- Never treat CORS, `Origin: null`, or loopback alone as authorization.
- Keep Electron sandboxing, context isolation, navigation restrictions, and CSP intact.
- Do not expose provider tokens, OAuth state, league data, imported rankings, local paths, or unredacted upstream errors.
- Keep deterministic recommendations as the default.
- Do not enable the unsupported direct Codex backend in normal builds.
- Do not bundle or redistribute third-party ranking data.
- Keep npm packages private; GitHub visibility does not require npm publication.

## Verification

Run the canonical gates from the repository root:

```bash
npm ci
npm run check
npm test
npm run build
```

For desktop, API, storage, or release changes, also follow the relevant smoke tests in `docs/WORKFLOW.md` and `docs/RELEASING.md`. Report platform-specific packaging evidence honestly; a Linux build does not prove Windows behavior.

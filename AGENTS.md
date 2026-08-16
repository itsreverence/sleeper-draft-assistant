# Agent guidance

## Scope

Keep changes narrowly relevant to Sleeper Draft Assistant. This is active alpha software, not an archived portfolio project.

## Required reading

Before implementation, read `README.md`, `docs/ARCHITECTURE.md`, `docs/WORKFLOW.md`, and any domain-specific document affected by the change.
When present, also read the root `CONTEXT.md` and any relevant decisions under `docs/adr/`; consumption rules live in `docs/agents/domain.md`.

## Boundaries

- Preserve the local-first design.
- Keep the API bound to loopback and require the per-launch capability token for every non-health route.
- Never treat CORS, `Origin: null`, or loopback alone as authorization.
- Keep Electron sandboxing, context isolation, navigation restrictions, and CSP intact.
- Do not expose provider tokens, OAuth state, league data, imported rankings, local paths, or unredacted upstream errors.
- Keep evidence normalization, availability checks, roster feasibility, unsupported-format checks, and AI-response validation deterministic. Codex is the strategist for the normal assistant experience; do not grow a parallel deterministic recommendation product.
- Keep Codex integration behind the supported local app-server provider. Do not enable the unsupported direct Codex backend in normal builds.
- Do not bundle or redistribute third-party ranking data.
- Keep npm packages private; GitHub visibility does not require npm publication.

## Change completeness

For each change, inspect every applicable surface without assuming all surfaces need edits: shared schemas and engine contracts; API routes, persistence, imports, and provider adapters; the Svelte renderer and Electron shell; user-facing and maintainer documentation; and reverse paths such as clear, reset, disconnect, cancellation, rollback, and migration.

## Verification

During implementation, run the narrowest relevant checks first for fast feedback. Before completion, run the full canonical gates from the repository root:

```bash
npm ci
npm run check
npm test
npm run build
npm audit
git diff --check
```

For desktop, API, storage, or release changes, also follow the relevant smoke tests in `docs/WORKFLOW.md` and `docs/RELEASING.md`. Report platform-specific packaging evidence honestly; a Linux build does not prove Windows behavior.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for this repository. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical triage labels configured for this repository. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain layout: root `CONTEXT.md` and system-wide ADRs under `docs/adr/`. See `docs/agents/domain.md`.

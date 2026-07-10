# Sleeper AI Team Manager

Local Sleeper-first fantasy football draft assistant and team manager.

This app is built to run on your own machine. Sleeper data is read through Sleeper's public API, player values come from an imported FantasyPros draft-rankings CSV, and AI answers are routed through a backend provider boundary instead of browser/frontend code.

## Current Alpha Scope

- Sleeper league and draft connection.
- Live draft board polling.
- Draft recommendations with deterministic engine signals.
- FantasyPros draft-rankings CSV import.
- Team Manager views for roster needs, lineup structure, waivers, weekly context, and activity.
- AI question panels over draft and team context.
- Experimental Codex subscription-backed provider options.
- Windows Electron packaging.

## Important Limitations

- Sleeper is the only supported fantasy platform.
- FantasyPros draft rankings are the expected player-value source for real draft advice.
- Sleeper search-rank fallback is low-confidence setup scaffolding, not a real projection model.
- Weekly projection imports are planned, but should wait until current FantasyPros weekly projection exports are available.
- Codex subscription-backed integration is experimental and isolated behind the backend `AiProvider` interface.

## Requirements

- Node.js 22+.
- npm.
- Windows for the packaged desktop build.

## Development

Install dependencies:

```powershell
npm install
```

Run the local API and web app:

```powershell
npm run dev
```

Run validation:

```powershell
npm run check
npm test
npm run build
```

## Desktop App

Run Electron in development:

```powershell
npm run desktop
```

Build an unpacked Windows desktop app:

```powershell
npm run desktop:package
```

Create distributable Windows targets:

```powershell
npm run desktop:make
```

The unpacked app is written under `apps/desktop/out-builder/win-unpacked`.

## First-Run Flow

1. Enter a Sleeper username or user ID.
2. Paste a Sleeper league URL or league ID if the league is new or still predraft.
3. Open the matching draft room.
4. Confirm your roster or draft slot was matched.
5. Open FantasyPros from the import panel, download the draft-rankings CSV for your scoring format, and import it.
6. Use recommendations and AI answers only after player values are imported for a real draft.

## AI Providers

The frontend never talks directly to Codex, ChatGPT, or OpenAI. All AI traffic goes through the local backend provider boundary.

See [docs/ai-provider.md](docs/ai-provider.md) for setup details.

## Release Prep

Before sharing a build, follow [docs/release-checklist.md](docs/release-checklist.md).

Planned weekly projection work is tracked in [docs/weekly-projections-plan.md](docs/weekly-projections-plan.md).
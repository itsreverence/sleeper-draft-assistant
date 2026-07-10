# Alpha Release Notes

## Sleeper AI Team Manager Alpha

This alpha is intended for local use with Sleeper leagues and FantasyPros draft-rankings CSV imports.

## Included

- Sleeper username, league URL, league ID, and draft ID connection flows.
- League and draft picker for Sleeper accounts.
- Live draft polling and pick feed.
- Deterministic draft recommendations with roster need, imported rank, tier, bye, ADP value, return probability, and scarcity signals.
- FantasyPros draft-rankings CSV import with persisted draft-level matching.
- Player preference controls: pin, fade, exclude, and what-if prompts.
- Team Manager workspace with roster needs, lineup structure, week context, waiver candidates, and activity.
- Draft and team AI question panels with conversation context and suggested questions.
- Backend `AiProvider` interface with deterministic fallback, experimental Codex backend, and Codex app-server options.
- SQLite-backed local persistence for settings, ranking imports, and decision snapshots.
- Redacted diagnostics export from Settings.
- Windows Electron packaging through Electron Builder.

## Known Limitations

- Sleeper is the only platform supported in this alpha.
- FantasyPros draft rankings must be imported manually.
- Recommendations are low confidence until rankings are imported.
- Weekly projections are not imported yet.
- Season mode is not a true weekly projection model yet.
- Trade analysis is not implemented.
- Codex subscription-backed providers are experimental and may change with upstream Codex behavior.

## Recommended Test Before Sharing

Run:

```powershell
npm run check
npm test
npm run build
npm run desktop:package
```

Then launch the packaged app and verify:

- Sleeper connection works for a real league.
- FantasyPros draft-rankings CSV import matches players.
- Recommendations no longer show placeholder warning after import.
- AI answers mention imported rankings without calling them projections.
- Settings can copy redacted diagnostics.

## Next Planned Feature Track

FantasyPros weekly projections import for Team Manager once current weekly projection exports are available.
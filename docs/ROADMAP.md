# Roadmap

This is a direction document, not a promise or release schedule.

## Current alpha

- Sleeper account, league, and draft discovery
- live/completed draft-state views
- synthetic demo draft
- FantasyPros rankings CSV import
- FantasyPros weekly projection CSV import
- deterministic recommendation evidence and weekly data confidence
- current-versus-optimized lineup totals and projected swap deltas
- roster, lineup, waiver, week, and activity views
- optional local Codex app-server analysis
- local SQLite persistence and Electron packaging
- explicit format compatibility warnings for custom scoring, TE premium, IDP, and auction leagues
- draft sync age, bounded retry backoff, and last-valid-state messaging
- recent recommendation-change review backed by persisted decision snapshots
- age warnings for imported draft, rest-of-season, and weekly data

## Before the first published alpha installer

- complete clean Windows first-run and uninstall testing
- validate unsigned-build and rollback guidance against the published artifacts
- confirm CI packaging on the release commit
- confirm tag-driven release checksums and provenance on the first prerelease
- validate diagnostics and local-data deletion on Windows

## Candidate follow-up work

- validate the weekly projection importer against current-season exports as formats evolve
- validate readiness thresholds against current-season projection imports
- export/delete controls inside the application
- stronger accessibility and keyboard-navigation coverage
- release signing when sustainable
- more deterministic engine fixtures and explanation tests
- dedicated dynasty, keeper, auction, and IDP models if demand justifies their separate complexity

## Non-goals for now

- automated drafting, lineup submission, or account mutation
- hosting the API on a LAN or public server
- bundled or redistributed commercial ranking data
- support for every fantasy platform
- treating AI output as authoritative advice
- enabling unsupported direct provider backends by default

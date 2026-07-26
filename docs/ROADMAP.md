# Roadmap

This is a direction document, not a promise or release schedule.

## Current alpha

- Sleeper account, league, and draft discovery
- live/completed draft-state views
- synthetic demo draft
- FantasyPros rankings CSV import
- FantasyPros weekly projection CSV import
- deterministic recommendation evidence
- roster, lineup, waiver, week, and activity views
- optional local Codex app-server analysis
- local SQLite persistence and Electron packaging

## Before the first published alpha installer

- complete clean Windows first-run and uninstall testing
- publish unsigned-build and rollback guidance
- confirm CI packaging on the release commit
- add release checksums and provenance notes
- validate diagnostics and local-data deletion on Windows

## Candidate follow-up work

- validate the weekly projection importer against current-season exports as formats evolve
- clearer data-freshness and confidence indicators
- export/delete controls inside the application
- stronger accessibility and keyboard-navigation coverage
- release signing when sustainable
- more deterministic engine fixtures and explanation tests

## Non-goals for now

- automated drafting, lineup submission, or account mutation
- hosting the API on a LAN or public server
- bundled or redistributed commercial ranking data
- support for every fantasy platform
- treating AI output as authoritative advice
- enabling unsupported direct provider backends by default

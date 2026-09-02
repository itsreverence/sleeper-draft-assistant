# Roadmap

This is a direction document, not a promise or release schedule.

## Current beta

- Sleeper account, league, and draft discovery
- live/completed draft-state views
- synthetic demo draft
- FantasyPros rankings CSV import
- FantasyPros weekly projection CSV import
- transparent draft evidence and weekly data confidence
- AI-first roster, lineup, waiver, and post-draft planning grounded in separate raw evidence signals
- compact roster, week, readiness, import, and activity views
- local Codex app-server analysis for the core assistant workflow
- local SQLite persistence and Electron packaging
- redacted support reports and in-app controls for clearing local data
- explicit format compatibility warnings for custom scoring, TE premium, IDP, and auction leagues
- draft sync age, bounded retry backoff, and last-valid-state messaging
- recent recommendation-change review backed by persisted decision snapshots
- age warnings for imported draft, rest-of-season, and weekly data

## Before stable

- validate rest-of-season and weekly imports against current FantasyPros exports, including the first 2026 ROS header signature used by season-value auto-classification
- finish the accessibility and keyboard-navigation pass
- keep upgrade, rollback, checksum, and provider-recovery checks in the Windows release smoke test
- sign release builds when the project can sustain the required certificates and release process

## Candidate follow-up work

- recheck import shapes and readiness thresholds as provider exports change
- stronger AI-context validation and Team Manager interaction tests
- dedicated dynasty, keeper, auction, and IDP models if demand justifies their separate complexity

## Non-goals for now

- automated drafting, lineup submission, or account mutation
- hosting the API on a LAN or public server
- bundled or redistributed commercial ranking data
- support for every fantasy platform
- treating AI output as authoritative advice
- enabling unsupported direct provider backends by default

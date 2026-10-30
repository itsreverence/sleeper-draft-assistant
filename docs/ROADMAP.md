# Roadmap

This is a direction document, not a promise or release schedule.

## Current release (0.1.2)

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
- selected-week NFL bye and opponent facts in Team Manager
- AI request priority over background refreshes, with phase progress

## Ongoing release gates

- continue checking provider export changes; the supplied 2026 ROS header and all 404 player matches are verified ([validation](research/week-2-ros-availability-2026.md))
- keep the desktop/compact accessibility and keyboard-navigation browser checks passing
- run the [every-release Windows smoke](RELEASING.md#real-windows-smoke) on each candidate; repeat the [once-before-stable pass](RELEASING.md#once-before-the-first-stable-release) after major shell, installer, or storage changes
- disclose unsigned artifacts and SmartScreen expectations; signing remains follow-up work when the project can sustain the required certificates and release process

## Candidate follow-up work

- show answers as they are written (streaming), keeping final validation before anything is saved
- recheck import shapes and readiness thresholds as provider exports change
- stronger AI-context validation and Team Manager interaction tests, including answers that must use returned tool values
- limit news research threads to hosted web search when users have their own Codex MCP servers configured
- dedicated dynasty, keeper, auction, and IDP models if demand justifies their separate complexity

## Non-goals for now

- automated drafting, lineup submission, or account mutation
- hosting the API on a LAN or public server
- bundled or redistributed commercial ranking data
- support for every fantasy platform
- treating AI output as authoritative advice
- enabling unsupported direct provider backends by default

# Privacy and local data

Sleeper Draft Assistant is local-first, but it processes fantasy-league and optional AI-provider data. This document describes the current alpha behavior.

## Network requests

The application may contact:

- Sleeper's public, tokenless API for users, leagues, rosters, drafts, picks, players, and NFL state;
- a locally installed Codex app-server when that provider is selected;
- external websites only when the user follows an allowlisted link.

The default no-provider mode makes no external AI request and does not show local pick recommendations. FantasyPros files are selected and imported by the user; the app does not download rankings or redistribute their contents. When Codex strategy is enabled, the local app-server receives a compact draft packet and may query an immutable in-memory available-player snapshot through the app's read-only search tool.

## Local data

The local SQLite database may contain:

- settings and provider selection;
- Sleeper league, roster, user, and draft identifiers needed for app state;
- imported ranking values and import summaries;
- imported weekly projection values and import summaries;
- recommendation and decision snapshots.
- the latest AI draft plan for each draft team and provider.

The packaged app writes beneath Electron's per-user application-data directory, in a `data` subdirectory. Development writes to repository `data/` unless `SLEEPER_AI_DATA_DIR` is set.

POSIX directories/files are created with owner-only `0700`/`0600` permissions. Windows uses the current profile's ACLs; chmod-style guarantees do not apply there.

## Authentication material

The supported Codex app-server provider relies on the user's separate local Codex installation and login. Sleeper Draft Assistant does not persist Codex credentials itself. On first launch after upgrading from a development build that offered the removed direct-backend experiment, the app resets that provider setting to deterministic mode and deletes its obsolete local token file.

The local API capability token is generated for each launch and kept in process/renderer memory; it is not intended as a persistent credential.

## Diagnostics

The **Copy diagnostics** action excludes provider tokens and raw imported rankings. The downloadable support report adds redacted decision-event metadata such as timestamps, triggers, pick counts, confidence, and aggregate assumption/risk counts. It excludes draft, league, roster, team, snapshot, and player identifiers; names; recommendation text; imported values; configured executable paths; and provider credentials.

Diagnostics and support reports can still contain versions, provider and model names, storage counts, and runtime details. Review the JSON before sharing it, and redact anything you consider sensitive.

Never post unredacted database files, ranking exports, screenshots with league identifiers, or provider-auth material to public issues.

## Deleting data

Settings includes controls to clear all ranking imports, weekly projections, or recommendation history. **Delete all local app data** resets those records, provider settings, and renderer connection preferences, then restarts the interface. The reset requires explicit typed confirmation.

For manual removal, close the app completely, locate Electron's per-user directory for **Sleeper Draft Assistant**, and delete its `data` directory. In development, delete repository `data/` or the directory assigned to `SLEEPER_AI_DATA_DIR`.

Deletion is local and immediate; the app has no cloud account to erase. It cannot delete data held independently by Sleeper, FantasyPros, OpenAI, or other providers.

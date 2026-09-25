# Privacy and local data

Sleeper Draft Assistant is local-first, but it processes fantasy-league and optional AI-provider data. This document describes the current beta behavior.

## Network requests

The application may contact:

- Sleeper's public, tokenless API for users, leagues, rosters, drafts, picks, players, and NFL state;
- a locally installed Codex app-server when that provider is selected;
- public NFL.com and ESPN news through Codex hosted web search when the AI requests a player-news lookup;
- external websites when the user follows an allowlisted link.

The default no-provider mode makes no external AI request and does not show local pick recommendations. FantasyPros files are selected and imported by the user; the app does not download rankings or redistribute their contents. When Codex strategy is enabled, the local app-server receives a compact draft packet and may query an immutable in-memory available-player snapshot through the app's read-only search tool.

Player-news lookups send a separate Codex context containing only public player identity, topic, and time. They do not receive league identifiers, roster history, imported values, or the original user question. Hosted searches are handled by OpenAI and may retrieve external public pages. This can add latency and account usage. Source links and summaries may appear in chat and persisted draft decisions; no separate news database is created. Read-only sandboxing does not itself disable hosted search: ordinary threads explicitly disable it and isolated research threads enable it. Retrieved content remains untrusted.

Web search defaults on and can be disabled in AI settings. Saving a change closes active provider/research sessions and resets chat context. Disabling it prevents further news lookups but does not delete sources already saved in draft decision history or erase data held by external providers.

## Local data

The local SQLite database may contain:

- settings and provider selection;
- Sleeper league, roster, user, and draft identifiers needed for app state;
- imported ranking values and import summaries;
- imported weekly projection values and import summaries;
- recommendation and decision snapshots.
- the latest AI draft plan for each draft team and provider.

The packaged app writes its substantive records beneath Electron's per-user application-data directory, in a `data` subdirectory. Renderer convenience preferences, including the remembered Sleeper username, are stored separately in Electron's Chromium profile beneath the same application-data directory. Development writes database records to repository `data/` unless `SLEEPER_AI_DATA_DIR` is set.

POSIX directories/files are created with owner-only `0700`/`0600` permissions. Windows uses the current profile's ACLs; chmod-style guarantees do not apply there.

## Authentication material

The supported Codex app-server provider relies on the user's separate local Codex installation and login. Sleeper Draft Assistant does not persist Codex credentials itself. On first launch after upgrading from a development build that offered the removed direct-backend experiment, the app resets that provider setting to deterministic mode and deletes its obsolete local token file.

The local API capability token is generated for each launch and kept in process memory plus renderer session storage so a renderer reload can recover. It is not written to local storage or SQLite and is not intended to persist across application sessions.

## Diagnostics

The **Copy diagnostics** action excludes provider tokens and raw imported rankings. The downloadable support report adds redacted decision-event metadata such as timestamps, triggers, pick counts, confidence, and aggregate assumption/risk counts. It excludes draft, league, roster, team, snapshot, and player identifiers; names; recommendation text; imported values; configured executable paths; and provider credentials.

Diagnostics and support reports can still contain versions, provider and model names, storage counts, and runtime details. Review the JSON before sharing it, and redact anything you consider sensitive.

Never post unredacted database files, ranking exports, screenshots with league identifiers, or provider-auth material to public issues.

## Deleting data

Settings includes controls to clear all ranking imports, weekly projections, or recommendation history. **Delete all local app data** resets those records, provider settings, and renderer connection preferences, then returns to the connection screen. The reset requires explicit typed confirmation. The database portion is committed as one local action. Failure before file replacement preserves prior data. If the file was replaced but durability could not be confirmed, the app keeps the new state and asks you to retry. Active AI work is closed when reset begins; pending requests cannot repopulate imports, settings, plans, or recommendation history afterward.

For manual removal of substantive records, close the app completely, locate Electron's per-user directory for **Sleeper Draft Assistant**, and delete its `data` directory. Delete the entire application-data directory if you also want to remove Chromium-backed convenience preferences. In development, delete repository `data/` or the directory assigned to `SLEEPER_AI_DATA_DIR`.

Deletion is local and immediate; the app has no cloud account to erase. It cannot delete data held independently by Sleeper, FantasyPros, OpenAI, or other providers.

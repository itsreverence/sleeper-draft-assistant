# Sleeper Draft Assistant

An unofficial, local-first fantasy football draft and team-management assistant for Sleeper.

> [!WARNING]
> This project is an early alpha. Validate every recommendation yourself, keep backups of anything important, and expect breaking changes before the first stable release.

![Sleeper Draft Assistant demo using synthetic data](docs/images/app-demo.png)

## What it does

- Connects to Sleeper's tokenless, read-only API by username, league, or draft.
- Tracks live and completed draft boards.
- Tracks active Sleeper drafts with lightweight two-second pick checks, while preserving the last valid board during transient failures with visible sync age and bounded retries.
- Keeps imported ECR, projections, and ADP as grounding evidence for AI strategy rather than presenting a local ranking as draft advice.
- Guides real drafts through a preparation stage before opening AI tools; current ECR is the normal-entry requirement, with an explicit limited-data escape path.
- Imports user-downloaded FantasyPros draft rankings, season projections, and Sleeper ADP exports; no third-party data is bundled or redistributed.
- Imports user-downloaded FantasyPros overall rest-of-season rankings and weekly projection CSVs for team-management analysis.
- Shows weekly data readiness, current-versus-optimized lineup totals, roster needs, waiver context, weekly context, and league activity.
- Refreshes visible Team Manager data from Sleeper every 60 seconds and when the app regains focus.
- Offers an optional local Codex app-server provider for conversational analysis.
- Reuses one local Codex app-server process and scoped draft/team threads during each run, preserving conversational continuity without resending prior chat messages from the UI.
- Uses a configured AI provider as the primary draft strategist near your turn, reasoning from neutral draft evidence and searching the full available-player snapshot through a read-only tool.
- Keeps comparisons, candidate questions, and what-if analysis in one contextual draft conversation that remains grounded in the latest board.
- Carries a validated living draft plan across AI turns so current-pick focus, next-turn priorities, roster goals, and board changes stay coherent throughout the draft.
- Shows explicit AI loading, unavailable, and not-configured states instead of substituting a local pick recommendation.
- Stores settings, imported rankings and projections, and decision history locally in SQLite.
- Shows a compact recent-decision review so recommendation changes can be traced to picks, imports, refreshes, or AI questions.

Sleeper is currently the only supported fantasy platform. Sleeper search rank is placeholder evidence only; import current draft data before relying on real-draft recommendations.

## League format support

| Format | Alpha support |
| --- | --- |
| Standard, half-PPR, and PPR redraft | Supported |
| FLEX and superflex roster construction | Supported |
| Custom scoring and TE premium | Limited; the app warns when imported values may not match |
| IDP | Unsupported; defensive players are excluded from recommendations |
| Auction/salary drafts | Unsupported; budgets and nomination strategy are not modeled |
| Dynasty and keeper valuation | Not yet modeled as a dedicated strategy |

Roster slots, team count, rounds, and supported scoring settings come from Sleeper. FantasyPros ECR and rest-of-season imports must match the league scoring format. Weekly `FPTS` are provider-scored, so users must export FantasyPros projections using the same scoring format as their Sleeper league.

## Try the demo in about a minute

Requires Node.js 22.12 or later and npm.

```bash
git clone https://github.com/itsreverence/sleeper-draft-assistant.git
cd sleeper-draft-assistant
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`, then choose **Load demo draft**. The demo uses synthetic data and requires no Sleeper account or AI provider.

## Use your Sleeper league

1. Enter your Sleeper username or user ID.
2. If needed, paste a Sleeper league URL or league ID.
3. Select the draft and confirm your team or draft slot.
4. Complete Draft preparation by choosing Codex or explicitly continuing without AI, then export rankings for your scoring format from FantasyPros and import the CSV as the required ECR and tier signal.
5. Export the season projection files for QB, RB, WR, TE, K, and DST and import them together. The FLX file is not needed because it duplicates players from RB, WR, and TE.
6. Export FantasyPros Overall ADP and import it for the Sleeper and Real-Time market columns. A separate Real-Time ADP download is not required.
7. During the season, export the overall rest-of-season rankings for your scoring format and import the single CSV from Team Manager.
8. Export the six weekly projection files for QB, RB, WR, TE, K, and DST, then import them together from Team Manager.
9. Enter the draft room after minimum readiness is met, then review the recommendation evidence before making a pick or changing your team.

The app reads Sleeper data but does not submit picks, change lineups, or modify your Sleeper account.

## AI providers

AI is optional for draft tracking and data imports. Without a configured provider, the app does not generate pick recommendations. When Codex app-server is configured, AI-first draft strategy runs automatically near the user's turn.

The supported optional integration runs a locally installed Codex CLI through `codex app-server`. Provider communication stays in the local API process rather than the renderer. No provider credentials are stored by Sleeper Draft Assistant.

See [AI providers](docs/AI_PROVIDERS.md) for setup and limitations.

## Desktop builds

```bash
npm run desktop          # Electron development
npm run desktop:package  # unpacked build for the current OS
npm run desktop:make     # distributable targets
```

Release builds are currently unsigned. Windows may display a SmartScreen warning, and macOS packaging/signing is not yet supported. Only install artifacts from this repository's Releases page once releases are published.

See [Installing on Windows](docs/INSTALLING.md) for artifact choices, checksum verification, local-data cleanup, updates, and rollback.

## Local data and privacy

The packaged app stores data beneath Electron's per-user application-data directory. Development uses `data/` in the repository unless `SLEEPER_AI_DATA_DIR` is set. Stored data can include league and draft identifiers, imported draft and rest-of-season rankings, season and weekly projections, ADP, settings, and recommendation history.

Settings shows aggregate local-data counts, can download a redacted support report, and provides controls to clear imports, recommendation history, or all local app data.

The API binds only to `127.0.0.1` and protects non-health routes with a random per-launch capability token. On POSIX systems, local data directories and files are created with owner-only permissions. Windows uses its normal per-user profile ACLs; POSIX mode bits are not a Windows security guarantee.

Read [Privacy and local data](docs/PRIVACY.md) before sharing diagnostics or deleting local state.

## Development

```bash
npm ci
npm run check
npm test
npm run build
```

Useful docs:

- [Architecture](docs/ARCHITECTURE.md)
- [Development workflow](docs/WORKFLOW.md)
- [Roadmap](docs/ROADMAP.md)
- [Release process](docs/RELEASING.md)
- [Installing on Windows](docs/INSTALLING.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Status and support

This is active alpha software. Use [GitHub Issues](https://github.com/itsreverence/sleeper-draft-assistant/issues) for reproducible bugs and scoped feature requests. Do not post tokens, private league data, imported rankings, or unredacted diagnostics.

## Unofficial project notice

Sleeper Draft Assistant is an independent project and is not affiliated with, endorsed by, or sponsored by Sleeper, FantasyPros, OpenAI, or ChatGPT. Sleeper, FantasyPros, OpenAI, ChatGPT, Codex, and related marks belong to their respective owners.

## License

[MIT](LICENSE)

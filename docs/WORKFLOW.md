# Development workflow

## Prerequisites

- Node.js 22.12 or later
- npm 11.x
- Codex CLI for real draft and Team Manager AI workflows
- Windows when validating Windows installers

## Setup and development

```bash
npm ci
npm run dev
```

The development launcher creates one random API token and passes it to both the API and Vite. Use `http://127.0.0.1:5173` and choose **Try a demo draft** for a synthetic-data smoke test.

For a real draft smoke test, confirm that any missing or stale ECR, missing season projections, missing Sleeper ADP, or unavailable Codex provider opens **Draft preparation** and keeps normal entry disabled. A fully ready returning draft should bypass preparation. Before the draft starts there must be no bypass. Once Sleeper reports the draft as actively drafting, incomplete setup may expose **Open emergency board only**; confirm the warning and verify that live pick tracking opens while AI recommendations and draft questions remain absent. In the normal workspace, verify that a list before your turn is headed **Targets if available** and that **Why this call** displays the exact selections until the user's pick and the following user pick and labels contingencies as elite fallers or upcoming-pick range. On the clock, the top row and one reason line lead and nothing else is bright. When a shortlist player is picked, the row is struck with **Taken by** and the next player moves up without blanking the list. In Settings, verify that **Fast responses** defaults on, can be saved off and back on, and leaves the provider ready after each change. **Settings > Manage draft data** must reopen the dedicated preparation workspace.

Running the API or web workspace separately requires coordinating `SLEEPER_AI_API_TOKEN` and `VITE_SLEEPER_AI_API_TOKEN`; the root launcher is the supported path.

## Canonical validation

For repeatable, harness-independent Chromium checks, see [Verification](VERIFICATION.md). Run `npm run test:browser` after installing Playwright Chromium. This supplements component tests and does not replace packaged Windows gates.

For popup checks, open Settings, the draft switcher, a team roster, Plan, Picks and roster, player search, and Manage team data. Verify initial focus (search starts in its input), Tab/Shift+Tab containment, Escape dismissal, opener focus restoration, and page-scroll restoration. Closed disclosures must not expose their controls to Tab. If dialogs overlap, only the top dialog should handle Escape, and the page must stay scroll-locked until the last dialog closes.

In player search, open a preference menu and press Escape. Only the menu should close, with focus returned to its preference button; a second Escape closes search.

Search for a broad term such as `a` with enough results to exceed the dialog height. Scroll over the result rows and confirm the final row is reachable while the header and filters stay visible. Repeat in a short/narrow window; the page behind the dialog should remain locked. Component tests do not measure browser layout, so this requires a real browser or packaged-app check.

On the connection screen, expand **Paste a league URL** and confirm the username prerequisite is explained before submission. For weekly imports, test an unrecognized single filename (uses the selected position), an unrecognized filename in a batch (asks for a separate import), and a FLEX/FLX export (skipped as redundant). For season value rankings, select an ADP CSV and verify the error identifies ADP and directs you to Overall ROS ECR or Overall Draft ECR. Replace it with a valid ECR export and verify the import succeeds. Selecting replacement files or pasting weekly CSV must clear the previous import error; new server validation errors must still appear. Pasting replaces any selected files. Tab to a **Choose CSV** or **Upload** control and confirm the focus ring shows and Enter or Space opens the system file chooser. In draft preparation, confirm only the next unmet step is green, and that **Enter draft room** turns green only when every step is ready.

```bash
npm run check
npm test
npm run build
npm audit
git diff --check
```

## Desktop

```bash
npm run desktop
npm run desktop:package
npm run desktop:make
```

`desktop:package` creates an unpacked application for the current platform. Do not report a Linux package as Windows evidence. Windows CI checks the unpacked API, a clean-profile candidate first run, checksum-verified upgrade from the highest published semantic version strictly lower than the build version on tag pushes, offline settings/guidance/rankings/season projections/ADP/history persistence, a clear of strategy instructions that preserves unrelated data, and a full reset of all five seeded data categories across relaunch, installed diagnostics/support-report redaction, native occupied-port Retry/Exit, per-user data and ACLs, uninstall retention, and portable renderer startup. A clean Windows first-run test in a real desktop session remains required before publishing an installer. See [Releasing](RELEASING.md) for the remaining manual checks.

The API reset and relaunch are automated on Windows for seeded rankings, season projections, ADP, guidance, and decision snapshots. ROS rankings, weekly projections, and saved AI draft plans need populated real-data checks during the fuller desktop pass. Once before stable, and after major shell, installer, or storage changes, verify the renderer reset flow as well. For this packaged local-data reset smoke, first close the app and back up the complete `%APPDATA%\Sleeper Draft Assistant` directory. Launch the app, open **Settings > Delete all local app data**, type `DELETE`, and choose **Delete and reset**. Verify the settings drawer closes promptly, the connection screen is usable without restarting the app, the remembered username is cleared, and no prior league or draft reloads. Close and relaunch once more to confirm the reset persists. Restore the backup only while the app is fully closed.

Windows CI drives the native startup-recovery dialog with a disposable listener. To investigate a failure on a real desktop, occupy the configured API port with a disposable listener and launch the app. Verify a safe Retry/Exit dialog appears without an empty app window. Stop the listener and retry; the app should start. Exit should close the failed launch without leaving its owned API process running. Never stop an unrelated process to free a port.

For async regression checks, switch teams or projection weeks during an AI question and confirm the late answer cannot replace the selected context. Reset during a pending import, reconnect, and confirm the old import does not reappear. For draft synchronization, correct a pick without changing the count and change draft status before the first pick; both changes should reach the board.

On Windows, quit during an active Codex request and check the process tree for the app's Codex descendant as well as Sleeper processes. Do not terminate unrelated Codex sessions. Run this fuller shutdown check before stable and after major shell, installer, or storage changes; Linux child-process tests do not prove it.

## API security smoke

Start with disposable data and a known test token:

```bash
SLEEPER_AI_DATA_DIR=/tmp/sda-smoke \
SLEEPER_AI_API_TOKEN=replace-with-a-long-random-test-token \
PORT=18787 npm run dev -w @sleeper-draft-assistant/api
```

In another shell, confirm:

- the listener is `127.0.0.1:18787`, not `*:18787`;
- `/health` succeeds without authentication;
- `/diagnostics` returns `401` without a token;
- `/diagnostics` succeeds with `Authorization: Bearer …`;
- a foreign origin does not receive permissive CORS headers;
- created data directories/files are `0700`/`0600` on POSIX.

Delete the disposable directory afterward. Never paste production tokens into shell history or issue reports.

## Troubleshooting

For news lookup checks, ask about a public player's current injury or practice report. Verify the answer either includes dated approved news sources (NFL.com, ESPN, official team sites, or NBC Sports) or acknowledges unavailable news. Ordinary roster questions need not search. Source links must open outside Electron; arbitrary domains, credentials in URLs, and non-HTTPS links must not. Switch team or reset during a lookup and verify the old answer cannot populate the new context. Quit during research and check that the app-owned research process closes as well as its main Codex process.

After a news request, inspect `newsLookups` in **Copy diagnostics**. A completed lookup records a bounded outcome, source-rejection counts, and elapsed milliseconds, not raw errors or private context. A timeout is distinct from a response rejected for sources/dates. No entries means no completed lookup in this provider session, not a successful retrieval test. Changing provider settings or resetting discards these in-memory entries.

Toggle **Web search** off in Assistant settings and save during a lookup. Verify the old request cannot repopulate chat, fresh questions still work from supplied evidence, and the setting stays off after relaunch. Turn it back on and verify fresh conversations can request news again. A full reset restores the enabled default.

- **Port already in use:** close the prior development or desktop process; the app intentionally refuses to attach to an API that cannot prove possession of its token.
- **Web requests return 401:** use the root `npm run dev` launcher so renderer and API receive the same token.
- **Codex cannot start:** verify the configured executable is `codex`, `codex.exe`, or `codex.cmd`, then run `codex login` separately.
- **Codex needs attention:** update the Codex CLI, run `codex login status`, and use the in-app retry after correcting CLI configuration or authentication. The app reports safe recovery guidance rather than raw provider output.
- **Windows Codex launcher:** prefer the default `codex` setting. The backend resolves the npm launcher without invoking `cmd.exe`; explicit non-npm `.cmd` wrappers are unsupported.
- **Windows package output is locked:** close all Sleeper Draft Assistant processes and retry.
- **Draft room entry remains disabled:** import current scoring-specific ECR, season projections, and Overall ADP, then confirm the Codex provider is ready.
- **League format warning:** standard, half-PPR, PPR, FLEX (including RB/WR and WR/TE flex), and superflex are supported. Custom scoring and TE premium require matching imports; IDP and auction advice is unsupported.
- **Ranking import is rejected:** choose the FantasyPros ECR or ROS export matching the connected league's standard, half-PPR, or PPR scoring. Team Manager season value rankings identify an ADP export explicitly. Choose Overall ROS ECR, or Overall Draft ECR until ROS is available. Overall ADP belongs in draft preparation, not season value rankings.
- **No separate Real-Time ADP download:** the Overall ADP export already contains both `Sleeper` and `Real-Time` columns.
- **Season projection import skips FLX:** import QB, RB, WR, TE, K, and DST; FLX duplicates the individual skill-position exports.
- **Team Manager needs two evidence categories:** use scoring-specific season value rankings for long-term value, then the six weekly projection files for current-week points. ROS ECR is preferred; matching draft ECR is a labeled fallback through Week 1 and prompts for replacement beginning in Week 2.
- **Team Manager imports:** use the data action in the roster heading; closing the drawer keeps the roster and Codex workspace in place.
- **Weekly position mismatch:** keep the original FantasyPros filenames when selecting several files, or select the matching position when importing one file. The importer rejects a filename/position label that disagrees with the CSV headers and rejects unsupported column orders.
- **Preseason Team Manager:** verify the roster loads, the page says **Preseason**, and no regular-season matchup or weekly-readiness warning is presented as current.
- **Season value rankings are inactive:** confirm the import season and scoring format match the connected league. Historical imports remain stored but do not affect current advice.
- **Weekly advice has no projection data:** import all six FantasyPros position exports for the selected season and week in Team Manager.
- **Weekly scoring warning:** weekly `FPTS` are used as FantasyPros provides them. Confirm the FantasyPros export scoring matches the Sleeper league.
- **Historical projections are inactive:** confirm the selected season and week match the connected league before evaluating lineup or waiver advice.
- **Sleeper draft refresh is degraded:** the last successful draft remains visible while the app retries automatically with bounded backoff. Use the reconnect control only when an immediate retry is useful.
- **Imported data is marked old:** replace the export with a current FantasyPros download before relying on time-sensitive draft, waiver, or lineup advice.
- **Weekly projections are three days old:** Team Manager keeps the stored import visible for replacement but excludes it from roster, available-player, readiness, and Codex evidence until fresh files are imported.
- **Team Manager is on the wrong week:** the default view follows Sleeper automatically. Loading a different week in Manage data intentionally pins that historical or future context; load the active week to resume following Sleeper.

## AI queue and progress verification

Queue tests cover question/manual-refresh priority, same-scope coalescing,
stale skips, failed-turn recovery, provider close, and bounded detached timing
metadata. Renderer tests cover phase announcements and context invalidation.
The phase-status and cancellation routes are also covered by composed-route
authentication tests. Browser tests retain their existing dialog and conversation
journeys; no answer streaming is introduced.

For an overlap regression, run `npx tsx scripts/measure-ai-queue.mts`. It asserts
that a question arriving behind a queued automatic refresh runs next, waits for
all three operations, and reports wall time and failure counts using a synthetic
100 ms question / 300 ms refresh client. For comparison against master, extract
its provider beside the current provider into an untracked temporary `.ts` file,
pass that path as the script argument, then remove it. This isolates scheduling;
it does not measure live Codex response latency. During a real news question,
verify phase changes, switch context while queued, and inspect both diagnostic
exports for metadata only. The API security smoke must cover the two new routes.

For API security smoke, include `GET /ai/requests/<random-handle>` and
`DELETE /ai/requests/<random-handle>`: both return 401 without the capability.
An authenticated unknown status returns `{ "phase": null }`; cancellation is
idempotent and returns no request information. While a real request waits,
status must return only its phase enum. Copy diagnostics and the support report
must contain only request kinds and `queueMs`, `modelMs`, `toolMs`, `newsMs` in
`aiTimings`, never the request handle, question, player, or news query. A settings
change/reset clears provider timing history just as it clears `newsLookups`.

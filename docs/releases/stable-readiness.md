# Stable release readiness

Prepared October 4, 2026 against beta.4 source (`6694db7`) plus the working-tree
changes described here. This is preparation evidence, not a published release or
Windows sign-off. The app deliberately remains `0.1.0-beta.4` until a new candidate
is selected. Existing beta.4 downloads do not contain these fixes.

## Changes prepared

- Research instructions now use the citation validator's exact approved host list.
  A source on another NFL/ESPN subdomain must be retrieved at an approved address
  before citation; guessing or rewriting URLs is forbidden. Validation, Electron
  link restrictions, date checks, the two-lookup limit and 20-second deadline are
  unchanged.
- Electron updated from 43.0.0 to 43.7.7. Compatible transitive dependency updates
  address the audit findings in brace-expansion, fast-uri, http-cache-semantics,
  and undici. The current full dependency audit is clean.
- Muted text contrast improved; draft chat has a persistent accessible name;
  roster coverage uses meter semantics and provider readiness uses status
  semantics. Browser checks cover these alongside keyboard and import flows.

## Verification

- `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit`, and
  `git diff --check`: passed. Unit/component/API suites contain 412 tests.
- `npm run test:browser`: all 24 checks passed across Chromium desktop
  (1280×800) and compact (480×600): keyboard containment,
  Escape, opener restoration, scroll behavior, imports/reset, strategy request
  triggers, and axe WCAG A/AA scans. These use synthetic data and controlled
  provider responses; they do not prove live strategy quality.
- Live Codex CLI 0.160.0: real draft-question provider and isolated news clients,
  synthetic draft context, authenticated local Codex, no user league data.
- Loopback API smoke passed: unauthenticated health, unauthorized diagnostics,
  authenticated diagnostics, no permissive foreign-origin CORS headers and POSIX 0700/0600
  data permissions.
- Linux unpacked Electron build and packaged Electron Node-runtime API startup,
  authentication and database-creation smoke passed. Package inspection found no CSVs,
  databases, source maps, test/research folders or repository workspace paths.
- Gitleaks 8.30.1: 403 reachable commits scanned with no leaks; the tracked diff
  also passed. Re-run against the eventual release commit and its history.

### Live news results

| Scenario | Lookup outcomes and elapsed time |
| --- | --- |
| Josh Allen injury/practice | `no_recent_sources`, 19,317 ms |
| Breece Hall injury/practice, synthetic player entry | `timeout`, 20,002 ms; `available`, 18,013 ms |
| Breece Hall injury follow-up in a fresh provider | `available`, 19,383 ms; `available`, 11,935 ms |

An additional request without Hall in the supplied snapshot correctly made no
lookup and disclosed the missing player evidence. These results demonstrate
successful retrieval, not a statistical reliability guarantee. Some searches
still time out; the response must disclose missing evidence. No timeout increase
was justified by this small sample.

Returned approved citations included the [NFL Week 4 injury report](https://amp.nfl.com/news/nfl-week-4-injury-report-player-statuses-for-all-16-games)
and [October 2 NFL news roundup](https://amp.nfl.com/news/nfl-news-roundup-latest-league-updates-from-friday-oct-2).
The injury-report URL loaded in the collaborative browser with the expected
article title. This proves URL/browser reachability, not packaged Electron's
external-browser dispatch. Model-reported dates varied between publication and
update dates, both within the accepted window; URL/date validation does not
independently certify every factual claim.

### Draft-plan investigation

The earlier statement that only an **explicit** strategy refresh changes the plan
was incomplete. Successful strategy-route calls save the plan and history;
requests can run automatically near the user's turn on draft entry, board
changes, player preferences, saved guidance, and provider search-setting changes.
A retry can also refresh strategy.

The browser trace verifies that asking a normal draft question and opening the
plan drawer leave the displayed plan unchanged and send no strategy request.
Changing a player preference does send a strategy request. The prior
[isolated API trace](beta.4-linux-validation.md) separately showed questions and
context loads preserving stored plans, with strategy updating the plan and its
history entry. No persistence change was warranted.

The exact action in the original Windows session was not recorded and cannot be
reconstructed. Treat a future plan change without a matching same-draft/team
`ai-strategy` history entry as a bug to investigate; intentional automatic strategy
updates are expected behavior. Do not restore or compare an open SQLite database.

## Remaining Windows and publication gates

Run these against the **new candidate**, not the old beta.4 installer:

1. Pass current Linux CI and Windows packaged startup CI. Build the candidate
   installer, portable executable and ZIP with matching checksums.
2. In a clean Windows profile: install interactively, launch/demo, connect Sleeper,
   import user-owned data, configure Codex and exercise its recovery guidance.
   Check native file selection → paste → same-file reselection, keyboard/focus
   and display scaling. Open an actual returned news citation in the default
   browser.
3. Upgrade from beta.4 with a closed-app backup. Verify imports/settings/history,
   shutdown and relaunch, including quitting during a main AI request and research.
   Check only app-owned descendant processes. Exercise occupied-port Retry/Exit.
4. Verify local-data location/profile ACLs, diagnostics redaction, category clears,
   full reset/relaunch, backup restore/rollback, and uninstall/reinstall as
   described in WORKFLOW.md and INSTALLING.md.
5. Select the stable version and synchronize workspace versions and lockfile.
   Run all canonical gates on that exact commit, inspect Windows artifacts and
   scan history. Review release notes/privacy/attribution, merge/tag, and verify
   published downloads/checksums. Keep the supported-format limits and unsigned
   SmartScreen disclosure. Signing is follow-up work under RELEASING.md.

No new installer, stable tag, or GitHub release was published during this work.
No Windows tests were run. Automated accessibility coverage is not a substitute
for assistive-technology testing or the native Windows checks above.

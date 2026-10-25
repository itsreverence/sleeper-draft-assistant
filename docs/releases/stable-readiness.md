# Stable release readiness

Prepared October 4, 2026 on beta.4 source (`6694db7`) with the changes described
here, which were later rebased onto the October dependency updates. This is preparation evidence, not a published release or
Windows sign-off. The selected Windows testing candidate is `0.1.0-beta.5`.
The remaining gates below now run against beta.5. Existing beta.4 downloads do
not contain these fixes.

## Changes prepared

- Research instructions now use the citation validator's exact approved host list.
  A source on another NFL/ESPN subdomain must be retrieved at an approved address
  before citation; guessing or rewriting URLs is forbidden. Validation, Electron
  link restrictions, date checks, the two-lookup limit and 20-second deadline are
  unchanged.
- Electron updated from 43.0.0 to 43.8.3. The October 23 advisories prompted
  further Electron and Undici updates and a native Zod 4 migration. Hono, Vite
  and earlier audit fixes landed in a separate dependency update. The full
  `npm audit` is clean again as of October 23.
- Muted text contrast improved; draft chat has a persistent accessible name;
  roster coverage uses meter semantics and provider readiness uses status
  semantics. Browser checks cover these alongside keyboard and import flows.

## Verification

- `npm ci`, `npm run check`, `npm test`, `npm run build`, and `git diff --check`:
  passed. Unit/component/API suites contain 412 tests. `npm audit` was clean on
  October 4; advisories published since then are covered above.
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

Run these against **0.1.0-beta.5**, not the old beta.4 installer:

1. Pass current Linux CI and Windows package smoke CI on the candidate. Windows
   CI now covers clean-profile installation, previous-release upgrade with seeded
   state preserved, installed redaction, guidance clear and full API reset across
   relaunch, native occupied-port Retry/Exit, data placement/ACLs, uninstall
   retention, and portable startup. See [automated gates](../RELEASING.md#automated-gates)
   for exact coverage and limits.
2. Complete the [every-release real Windows smoke](../RELEASING.md#real-windows-smoke-about-10-minutes)
   before tagging, using the exact commit's passing pre-smoke `windows-candidate`
   artifact and its logged ID/digest. Record the maintainer's confirmation in the
   [beta.5 release notes](0.1.0-beta.5.md#manual-checks).
3. Complete the [once-before-stable pass](../RELEASING.md#once-before-the-first-stable-release).
   It remains pending for beta.5. Use that list for the native interaction,
   live-provider recovery, additional reset categories, shutdown, profile access,
   and backup restore/rollback checks that CI does not prove.
4. Select the stable version and synchronize workspace versions and lockfile.
   Follow [publication checks](../RELEASING.md#publish-the-verified-commit) on that
   exact commit, including package inspection, history scanning, release-note and
   attribution review, and published-download checksums. Keep supported-format
   limits and unsigned SmartScreen disclosure. Signing remains follow-up work.

Do not claim Windows readiness based only on Linux packaging or CI. A real
clean-profile Windows launch remains the final distribution gate.

No new installer, stable tag, or GitHub release was published during the original
readiness work above. Its historical Linux and browser results are not beta.5
Windows sign-off. Automated accessibility coverage does not replace the native
Windows checks in RELEASING.md.

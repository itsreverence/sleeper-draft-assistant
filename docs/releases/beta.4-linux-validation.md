# Beta.4 Linux verification

Verified source commit `6694db72a47efef97c2821f473114921250d871e` on September 26, 2026. This checks shared behavior locally, not the Windows installer. No real league data or application profile was used.

## Passed

- `npm ci`, `npm run check`, `npm test` (411 tests), `npm run build`, `npm audit` (zero vulnerabilities), and `git diff --check`.
- `npm run test:browser`: 14 tests across desktop and compact Chromium layouts, including weekly CSV selection → paste → import → same-file reselection.
- With web search disabled, the live Codex provider answered in 4,603 ms, recorded no news lookups, and explicitly disclosed missing current health-status evidence.
- Headless Chromium loaded the approved canonical NFL article below with HTTP 200 and the expected article heading. This is browser reachability evidence, not Electron external-link dispatch evidence.
- An isolated API trace used real route handlers, authorization, SQLite, and upstream normalization, with synthetic Sleeper responses and a synthetic provider. After establishing a saved plan, a Team Manager question, draft question, completed-team load, and return-to-draft load each left the persisted plan unchanged. An explicit strategy refresh changed the plan and recorded its matching `ai-strategy` history entry. This tests the persistence contract, not a full renderer journey or the exact original Windows session.

## Live news: successful retrieval remains unverified

The installed authenticated Codex CLI was `0.156.1`. Three calls through the real draft-question provider, using synthetic draft evidence and a public Josh Allen injury/practice query, completed with these news diagnostics:

| Attempt | Outcome | Lookup duration |
| --- | --- | --- |
| 1 | `invalid_source` | 19,557 ms |
| 2 | `timeout` | 20,002 ms |
| 3 | `invalid_source` | 19,926 ms |

Each answer disclosed that current reporting could not be verified. These are safe failure-path results, not successful research passes.

For attempt 3, temporary instrumentation around the real research client's returned JSON identified a rejected URL on `fantasy-www.nfl.com`. The dated article was [NFL Week 3 injury report: Player statuses for all 16 games](https://www.nfl.com/news/nfl-week-3-injury-report-player-statuses-for-all-16-games), reported September 23, 2026. Both the returned alternate-host URL and the approved `www.nfl.com` URL returned HTTP 200. The alternate page declared the approved URL as its canonical link, and the article metadata agreed with the returned report date.

The app's source validation correctly rejects the alternate host. Hosted search is restricted to the domains `nfl.com` and `espn.com`, while response validation and Electron opening permit only specific hosts. The research prompt also names domains, not those exact hosts. This leaves a source-selection mismatch that occurs on Linux as well as Windows. Attempt 1 was not instrumented, so its specific rejection cause is unknown.

Before stable release, align research instructions with the exact accepted hosts and verify an actual successful lookup with a returned source. Do not accept arbitrary NFL subdomains or silently rewrite model-returned URLs without verifying their destination. The 20-second lookup budget also remains a reliability constraint; one timed-out sample alone does not establish a suitable replacement budget.

## Scope remaining

- The original Windows plan-change trigger is still unconfirmed. The controlled API trace did not reproduce an unintended write.
- An approved article loading directly is not proof that a returned citation opens through packaged Electron into the operating system's browser.
- Windows-specific installer, native dialog, process-lifecycle, and external-browser checks remain distinct from shared parser, persistence, and research behavior.
- No application behavior or security policy was changed during this verification.

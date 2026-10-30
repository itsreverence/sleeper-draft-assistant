# Verification

## Browser checks (any harness)

From the repository root:

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Linux CI installs browser system dependencies with `npx playwright install --with-deps chromium`. On other Linux distributions, follow Playwright's dependency diagnostics rather than assuming Ubuntu package commands work.

The runner starts the real API and Vite on dedicated loopback ports 18887 and 15173. It refuses to reuse existing servers, creates a fresh temporary database and capability token, and uses the noop provider and synthetic demo draft. Each test gets a fresh browser context. Browser routes set the synthetic user on the clock, freeze pick events, and provide a fixed AI status/recommendation so player search is reachable without Codex. These are dialog/layout tests, not live strategy or SSE tests. It does not require Sleeper credentials, Codex, T3, or a user profile. Close only test-owned processes if interrupted; never kill an unrelated server to free a port. Normal completion removes the temporary database, including after test failures.

Team Manager scenarios connect synthetic completed drafts through the real API. A test-process-only preload supplies raw Sleeper responses and rejects unconfigured outbound fetches; normalization, authorization, CSV parsing and SQLite persistence are not mocked. Each scenario uses a unique league ID. The suite runs one worker because the reset scenario intentionally clears the test database. ROS and weekly CSV values are synthetic, not redistributed ranking data. One test holds delivery of a completed import response across reset/reconnection to check renderer request ordering; this does not simulate a reset racing an upstream request before persistence (the API suite owns that case).

```bash
npm run test:browser -- --project=desktop
npm run test:browser -- --headed
npx playwright show-report
```

Failures retain screenshots and traces under ignored `test-results/`; the HTML report is under `playwright-report/`. Traces can contain the disposable launch token and synthetic API payloads: keep them local unless reviewed. They are not uploaded by CI. Tests must not be redirected to a real user profile. Installation downloads browsers; normal scenarios use the local demo and block external browser requests. This is not an OS network sandbox for the API.

## Initial feature map and proof owners

| Surface | User entry | Primary evidence |
| --- | --- | --- |
| Demo | Connection screen → Try a demo draft | Browser suite loads the renderer through the real API |
| Settings | Open settings button | Browser keyboard dismissal/focus; `App.test.ts` owns application wiring and modal unit tests own action edge cases |
| Player search | Demo → Find player | Browser checks actual overflow, reachable last row, fixed header/search and page scroll lock at desktop/compact sizes |
| Search matching | Search input and position filters | `player-search.test.ts` owns ordering and matching; browser tests do not replay its tables |
| Preference popover | Search result → Preference | Component regression owns callback routing; browser suite exercises native popover Escape handling and focus restoration, not the jsdom shim |
| Answer formatting | Draft questions and Team Manager command bar | Component tests cover pipe-table parsing, ordered lists, inline bold/emphasis/code, inline safety and original Markdown copy; browser tests check semantic tables, keyboard scrolling of wide tables only, contained overflow, and unique table landmark names across a thread under axe at desktop/compact sizes |
| Team imports | Manage team data | Browser file upload → real parser/storage → reload; ROS replacement/clear; weekly replacement, week selection, displayed roster points and scoped clearing (compact layout hides the points column) |
| Reset and stale imports | Settings → Delete all local app data → reconnect | Browser holds an import response, resets, connects a different team, then delivers it; verifies the new team and cleared storage remain intact. API tests own pre-persistence races; component/session tests own additional ordering cases |
| Conversation thread | Draft questions and Team Manager command bar | Component tests own the follow-newest rule, the cancel state and the discarded late answer; browser tests check real scroll geometry: each new answer starts at the thread's top, the thread stays put when the reader scrolled up, Cancel returns the composer to idle with the DELETE sent and no late answer, under axe at desktop/compact sizes and with the composer reachable at 320px |
| Packaged app | Windows executable | Windows packaged smoke and manual lifecycle gates in RELEASING.md; Chromium is not Electron/installer proof |

## Test authoring and focused audit

Before adding a test, name the observable contract, a credible regression, why existing proof misses it, and whether it requires a test-only production seam. Prefer the real boundary over exporting internals. Tests at two layers should cover distinct risks, not repeat identical assertions.

The initial audit retained `modal.test.ts`, `PlayerSearchDialog.test.ts`, the Settings case in `App.test.ts`, and `player-search.test.ts`. They cover action edge cases, callback behavior, application wiring and search logic. The search component test explicitly simulates native popovers; jsdom cannot establish real geometry. Browser checks therefore add platform/layout evidence, not replacement coverage. No tests were removed and no production seams were added for this suite.

The delayed-import browser regression was checked with a temporary negative control: removing the team-session stale-response guard caused the newly connected team assertion to fail. The guard was restored before the passing run; no production behavior change was needed.

Before deleting a candidate, inspect its production owner, callers, neighboring coverage and history. Identify the stronger remaining proof. Security, storage, platform and release assertions are not redundant merely because they inspect static structure. A failing retained test may indicate a product bug, not junk coverage. For regression fixes, demonstrate failure for the intended reason before the fix and success afterward.

These criteria are informed by [OpenClaw's test-audit](https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/SKILL.md); its repository-specific commands and deletion campaigns are not adopted. Runner lifecycle follows [Playwright webServer](https://playwright.dev/docs/test-webserver).

## Stable-readiness coverage

The browser suite also checks keyboard focus containment and restoration for the
draft plan, roster, switcher and team-data drawers, plus collapsed import tab
order. Axe checks WCAG A/AA rules on connection, draft conversation, Settings,
player search, draft plan, Team Manager and team-data views at desktop and compact
sizes. This includes text contrast and accessible control semantics; it is not a
screen-reader certification or native Windows accessibility sign-off.

A renderer interaction test verifies that an ordinary draft question and opening
the plan do not invoke the strategy route, while changing a player preference
does. The strategy response is synthetic, so this proves renderer request
triggers, not live AI quality or database persistence. The API/store tests and
recorded isolated API trace cover the server side separately.

## Roster feasibility (bounded exhaustive check)

`npm run verify:roster-feasibility` checks every roster state within stated bounds. It compares `isDraftChoiceRosterFeasible`, which guards AI picks, and the required-position filter in `buildDraftOptions` against a brute-force lineup matcher. It takes about 45 s locally and about a minute in CI. It runs separately from `npm test`; CI also runs it in the `validate` job. The expected baseline is a full pass. The bounds, the slot-rule sources and the update procedure are in [the verify-roster-feasibility skill](../.agents/skills/verify-roster-feasibility/SKILL.md). Run it when changing roster slots, flex or superflex handling, remaining-pick counting, or AI pick validation.

## Completion and remaining scope

Run the canonical gates in WORKFLOW.md in addition to browser tests. Report the browser projects actually run, failures/artifacts, and any untested behavior. The web build asserts the shipped renderer CSP; this browser suite does not certify live Sleeper or FantasyPros responses, live Codex, web research, every reset category, Electron navigation or runtime CSP enforcement, Windows scaling, or installation. Windows interrupted-run server cleanup also needs platform verification; normal Linux completion is not proof of Windows signal handling. Keep those existing manual/platform gates until independently automated.

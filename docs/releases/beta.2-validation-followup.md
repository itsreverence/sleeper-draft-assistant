# Beta.2 validation follow-up

Date: 2026-09-25. These are source changes after beta.2, not changes to its published installer.

## Windows report

The tester's final beta.2 report records successful upgrade, retained imports/settings/history, launch/relaunch, basic AI use, web-search setting persistence, app-owned process shutdown, loopback/authentication checks, backup/reset/restore, and uninstall/reinstall. It also records sampled keyboard, scaling, and stale-response checks. These are tester-reported results for beta.2, not Windows validation of the changes below.

## Fixes and evidence

- **Player-search scrolling:** reproduced in the T3 native browser with the actual component and a synthetic draft. At a 1280×800 viewport, 26 results occupied 1,784 px inside a 640 px dialog; the results area could not scroll. Constraining the grid's final row made the results area 461 px tall and allowed a 450 px scroll while keeping it inside the dialog. The shared modal scroll lock remains intact. Browser layout is covered by a manual smoke procedure, not a jsdom geometry assertion.
- **Connection guidance:** the league-link form now explains that the username above identifies the user's team. Identity requirements and the lookup handler are unchanged.
- **Weekly CSV feedback:** unknown single filenames use the selected position without being labeled FLEX. Unknown batch filenames receive separate guidance; recognized FLEX/FLX exports are skipped. Replacement files and pasted CSV clear the prior error, and pasted CSV replaces selected files. Read failures are sanitized; superseded reads cannot replace newer inputs. Server header validation remains authoritative.
- **News diagnostics:** diagnostics/support reports expose only the latest 20 outcome categories and elapsed milliseconds from the current provider session. Tests cover safe failure categories, timeout/cancellation cleanup, bounded retention, detached copies, and inspection without provider startup. No player identity, prompt, source URL, article text, or raw exception is retained.
- **NFL AMP sources:** a controlled live lookup returned an article on `amp.nfl.com`, which the exact-host source allowlist rejected. Verified against the [NFL AMP news site](https://amp.nfl.com/news/). Added only that exact host to shared source validation and Electron external-link handling. Tests retain rejection of lookalikes, arbitrary subdomains, HTTP, credentials, and nonstandard ports.

## Live news checks

Used locally installed Codex CLI 0.156.1, `gpt-6-astra`, Standard service tier, and a synthetic draft snapshot. No saved league, imported rankings, or real user question was sent for these checks.

An ordinary real-model question completed without requesting the optional news tool; that alone was not retrieval evidence. A controlled caller then invoked the actual snapshot-bound tool through the provider with a real isolated research client. One attempt timed out at 20 seconds. Longer-budget diagnostic probes returned before their deadlines but were rejected for source URLs; inspection isolated the exact `amp.nfl.com` host mismatch. No article contents or full URLs were added to diagnostics.

After the host fix, the same controlled provider path returned `available`, appended validated dated sources, and completed research in 18,774 ms within the unchanged 20-second budget. This verifies one successful live retrieval path, not guaranteed search latency, article truth, or model tool selection on every question.

## Remaining Windows checks for the next build

Local verification passed: `npm ci`, `npm run check`, all 411 tests, `npm run build`, `npm audit` (zero vulnerabilities), and `git diff --check`. Linux unpacked packaging and a disposable packaged-API smoke passed: unauthenticated health, protected diagnostics returning 401, authenticated diagnostics returning 200 with the new empty lookup list, foreign-origin rejection, and owner-private data permissions. These checks do not establish Windows packaging or desktop correctness.

1. Search `a` in a populated draft. Wheel over results, reach the final row, and repeat in a short window and at 125%/150% scaling. Check preference-menu Escape, then dialog Escape and restored focus.
2. Expand **Paste a league URL** with an empty username and confirm the prerequisite is visible.
3. Select an unknown single CSV filename, submit an invalid header, then replace it with valid position files. Confirm accurate selection notes, cleared old error, and successful import. Also test a FLEX/FLX file and switching from selected files to pasted CSV.
4. Ask about current reporting for a player in the loaded snapshot with web search enabled. Inspect `newsLookups` in Copy diagnostics; an empty list is not a retrieval pass. If an NFL AMP citation is returned, verify it opens in the external browser.

T3 disconnected during the narrow-viewport check and remained unavailable on retry. Desktop-width scrolling was verified before the disconnect; narrow-screen layout and packaged Windows behavior remain pending. Do not promote this evidence to stable-release sign-off.

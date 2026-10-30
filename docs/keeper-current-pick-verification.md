# Keeper current-pick verification

These fixtures assume that Sleeper returns pre-filled keeper allocations with their real overall `pick_no`. No live account or public draft was queried. That assumption remains unconfirmed against a live in-progress keeper draft.

## Hand-computed cases

Each case uses 12 teams and three snake rounds. The user owns slot 3, whose original selections are 3, 22 and 27, except where noted. All numbers below are overall picks. A wait counts unmade selections before the next user pick. “Between” excludes both user turns and every filled slot.

| Case | Ordinary picks made | Keeper slots filled | Current | Next / following user pick | Wait | Between |
| --- | --- | --- | --- | --- | --- | --- |
| Two round-one keepers | None | 5, 8 | 1 | 3 / 22 | 2 | 16 |
| Later-round keepers | None | 14, 26 | 1 | 3 / 22 | 2 | 17 |
| Arrive at one keeper | 1–2 | 3 | 4 | 22 / 27 | 18 | 4 |
| Arrive at consecutive keepers | 1–2 | 3–5 | 6 | 22 / 27 | 16 | 4 |
| Own pick is a keeper | None | 3 | 1 | 22 / 27 | 20 | 4 |
| Keeper plus trade of pick 1 to user | None | 2, 5 | 1 | 1 / 3 | 0 | 0 |
| Only remaining pick, user slot 12 | 1–32 | 33–35 | 36 | 36 / none | 0 | — |
| Completed | 1–34 | 35–36 | 36 | none | — | — |
| No keeper regression | 1–2 | None | 3 | 3 / 22 | 0 | 18 |

For example, between picks 3 and 22 there are 18 slots, 4 through 21. Filling keeper slots 5 and 8 leaves 16 selections. In the trade case, pick 2 is filled, so user picks 1 and 3 are consecutive selections even though their overall numbers differ by two.

The market inspection tool preserves its existing meaning: when the user is on the clock it looks ahead to their following turn, and its wait includes the current selection. Thus its wait is 1 in the trade case and 19 in the no-keeper case.

## Evidence

- API normalization and web tests share synthetic raw fixtures and the explicit expected table. Raw picks are deliberately supplied in reverse order.
- Temporarily replacing the new current-pick expression with the old line makes the two-round-one-keepers test fail: expected 1, received 3. The fixed source was restored.
- A temporary comparison test loaded the normalizer and mock engine directly from master `d3472b9`. Full normalized output, excluding only `updatedAt`, matched for all 37 contiguous prefixes of each of snake, linear and third-round-reversal fixtures, and mock inputs 0 through 100. The temporary master copies were removed.
- API route tests accept the true current pick in `basedOnPick` and reject the count-derived value. They also reject a non-starter choice when a future owned keeper leaves only one usable selection, with both Sleeper order and legacy snake fallback.
- The roster verifier now places existing roster allocations in future keeper slots. All 995,328 bounded states pass. Removing the engine's filled-entry exclusion produces P1 and P2 failures; restoring it passes.
- Keeper slot metadata remains exempt from the existing contradiction check. Non-keeper contradictions still produce unsupported timing, covered by the existing tests.
- The isolated API smoke uses a free loopback port and disposable data. It checks health, capability authorization, foreign-origin headers, AI request status and cancellation authorization, and POSIX file permissions. Only its own process group is stopped.

## Consumer audit and compatibility

The board current cell and current round follow the normalized first unmade overall number. Shared timing functions drive upcoming user picks, board team next picks, the strip, on-clock state, recommendation timing, AI context waits and remaining selections, and market-tool next-turn lookup. Intervening-team lists skip filled allocations. Recent-pick lists omit future keeper slots while full rosters and availability still include every keeper. The stream status says “Draft picks updated” rather than inferring a recorded pick from current minus one.

The mock generator still counts its contiguous scripted picks. Status completion still uses the existing count and upstream status rules. The missing-round fallback now uses the highest real overall pick number, so a later-round keeper cannot shrink the inferred board to the first round.

No DraftState schema, database schema, stored record format, version number, provider boundary, or Electron configuration changes. Clear, reset, disconnect, and rollback to 0.1.1 require no migration. Existing history and plan records keep their existing decoding and current-pick validation.

Linux unit, build, browser and API smoke evidence does not verify Windows packaging, live Codex, or live keeper payload behavior.

## Gate results

- `npm ci`: passed.
- `npm run check`: passed, including Svelte and browser TypeScript checks.
- `npm test`: passed: API 472, desktop 25, web 341, engine 25, plus the root notice-generation checks.
- `npm run build`: passed, including the renderer CSP assertion.
- `npm run test:browser`: all 110 Chromium tests passed with retries disabled.
- `npm audit`: exited 1 with the expected three low findings in the existing deepmerge and Svelte plugin dependency chain.
- `git diff --check`: passed.
- `npm run verify:roster-feasibility`: all 995,328 bounded states passed after restoring the mutation.
- Isolated API security smoke: passed.

An initial type check identified that the AI tool snapshot needed its existing draft status carried into the shared timing calculation. An initial web test identified the inconsistent mock fixture described above. Both were fixed before the passing gates. No flaky failure was rerun.

---
name: verify-roster-feasibility
description: Exhaustively check the draft engine's starting-lineup feasibility rules (isDraftChoiceRosterFeasible and the required-position filter in buildDraftOptions) against a brute-force lineup matcher using Sleeper's slot rules. Use when a change touches roster slots, flex or superflex handling, starter-slot counting in packages/shared/src/roster-slots.ts, remaining-pick counting, or AI pick validation.
---

# Verify roster feasibility

Two promises the engine makes during a draft:

- **P1. AI picks never strand the lineup.** `apps/api/src/routes/draft-routes.ts` rejects a Codex recommendation or alternative when `isDraftChoiceRosterFeasible` is false. If this function is wrong, users get told to draft a player that leaves a starter slot unfillable, or a valid pick is rejected.
- **P2. The reference board offers exactly the safe positions.** When the user's remaining picks are only just enough to fill the starting lineup, `buildDraftOptions` restricts the board to required positions and tags them `requiredToCompleteLineup` (shown as "Required starter position" on `CandidateCard`). If this is wrong, the board hides usable positions or leads with a pick that leaves a starter slot empty.

`packages/engine/verify/roster-feasibility.ts` enumerates every roster state within its bounds, calls the real exported functions, and compares them with a reference. The reference is Kuhn bipartite matching, which finds the starter slots left empty by the best assignment of rostered players.

The harness keeps its own copy of Sleeper's slot rules, `SLOT_ELIGIBILITY`. It deliberately does not import the app's `STARTER_SLOT_POSITIONS`, so a wrong table in the app fails the check. The table:

- `FLEX` takes RB/WR/TE.
- `WRRB_FLEX` takes RB/WR.
- `REC_FLEX` takes WR/TE.
- `SUPER_FLEX` (alias `SF`) takes QB/RB/WR/TE.

Sources for these rules were confirmed in October 2026. Three widely used Sleeper integrations read Sleeper's real `roster_positions` this way: [ffscrapr](https://github.com/ffverse/ffscrapr/blob/main/R/sleeper_starterpositions.R), [league-page](https://github.com/nmelhado/league-page/blob/master/src/lib/utils/helperFunctions/predictOptimalScore.js) and [fantasy-football-metrics-weekly-report](https://github.com/uberfastman/fantasy-football-metrics-weekly-report/blob/main/ffmwr/dao/platforms/sleeper.py). Draft settings use the keys `slots_wrrb_flex` and `slots_rec_flex`.

## Does the change touch it?

Rerun when a diff touches the functions under **Coverage**, `DraftState` roster or pick-order fields in `packages/shared/src/index.ts`, or the slot names accepted in `apps/api/src/format-compatibility.ts`. To see what changed since the verification was last confirmed:

```bash
git diff b93a1ae -- packages/shared/src/roster-slots.ts packages/engine/src/index.ts apps/api/src/routes/draft-routes.ts packages/shared/src/index.ts apps/api/src/format-compatibility.ts
```

Not every hunk matters: only the functions in **Coverage** and the fields above do. If a covered function changed and nobody rechecked it, follow **Updating** even when the check still passes.

## Run

```bash
npm run verify:roster-feasibility
npm run check -w @sleeper-draft-assistant/engine   # type-checks the harness and the engine
```

It takes about 30 s and needs no network or app data. It runs as its own command rather than in `npm test` because of that runtime.

## Read the result

The expected output at the sync commit:

```
Checked 995328 roster states (6 candidate positions each) in ~27s.
All properties hold within the bounds.
```

The process exits with code 0. Any `FAIL` line means behavior changed. Each line gives superflex and non-superflex counts separately and prints a first counterexample for each: starter slots, rostered counts, user picks left, and what the function returned versus the reference.

- **Decide whether it's a bug or a harness error.** Rebuild the counterexample by hand and ask whether the starting lineup can really be completed with that many picks. If it can't but the engine says it can (or the reverse), you've found a real bug. If the harness built a state the app can't produce, fix `makeState` or `setRemainingPicks` and note why. For example, an empty `pickOrder.entries` makes `countRemainingUserPicks` fall back to snake math, which is why the harness always adds another team's closing pick.
- **Unintended change that breaks a property:** report it as a regression with the counterexample in draft terms, e.g. "with QB/RB/WR/TE/REC_FLEX starters, a spare RB rostered and one pick left, the engine accepts another RB". Leave the harness and the sync commit alone. The code needs fixing, not the check.
- **Intended rule change:** follow **Updating**.

## Scope and assumptions

- **Bounds:**
  - starter slots QB 0–1, RB 0–2, WR 0–1, TE 0–1, DEF 0–1, K 0
  - `FLEX`, `WRRB_FLEX` and `REC_FLEX` each 0–1, combined freely
  - one superflex key: `SUPER_FLEX` 0–1 or `SF` 1
  - rostered QB 0–2, RB 0–3, WR 0–2, TE 0–2, DEF 0–1, K 0
  - user picks left 0–3
  - one candidate of every position, including K
- **Why the bounds are small:** combining the flex types gives up to four flex slots with overlapping eligibility, which is where matching can go wrong. K and DEF are handled identically, so K slots and rostered K stay at 0. A pass covers these bounds, not every league size.
- **Players are assumed available:** P1 assumes any position can be drafted later. The check does not model positional scarcity in the player pool.
- **P1 policy:** while the lineup can still be completed, a pick is accepted exactly when it stays completable. Once it can't (shortfall greater than picks left), only picks that shrink the shortfall are accepted (`index.ts`, the return in `isDraftChoiceRosterFeasible`). P2 is checked only while the lineup is completable and at least one pick remains.
- **Remaining picks:** these come from Sleeper `pickOrder` entries only. The normal-snake fallback in `countRemainingUserPicks` is not covered.
- **Not covered:**
  - `getRosterFit` labels
  - `openFlexSlots` and `openSuperFlexSlots` in `apps/api/src/ai/context.ts` (unit tests only)
  - Team Manager lineup handling
  - ordering and preferences in `buildDraftOptions` beyond which positions appear
  - IDP and unknown slots, bench limits
  - whether Codex respects the rules

## Coverage

| Check | Code |
| --- | --- |
| P1 | `packages/engine/src/index.ts`: `isDraftChoiceRosterFeasible`, `getHardRequiredStarterGapCount`, `countRemainingUserPicks` (Sleeper-order branch), `countRosterPositions`; `packages/shared/src/roster-slots.ts`: `STARTER_SLOT_POSITIONS`, `countUnfilledStarterSlots`; consumer `apps/api/src/routes/draft-routes.ts` (strategy route validation) |
| P2 | `packages/engine/src/index.ts`: `buildDraftOptions`, `getMandatoryCompletionPositions`, plus the P1 slot count |
| Reference | `SLOT_ELIGIBILITY` in the harness: Sleeper's rules, sourced above, not the app's table |

**Sync commit:** `b93a1ae`, the commit at which the harness was last confirmed to describe the covered code. It was confirmed to catch these scratch breaks:

- `REC_FLEX` accepting RB in `STARTER_SLOT_POSITIONS` (P1 for every position, plus P2b)
- filling flex slots greedily without reassigning earlier players in `countUnfilledStarterSlots` (P1 and P2)
- counting non-reducing picks as required in `getMandatoryCompletionPositions` (P2b)

At the earlier sync commit `6958fbf`, the harness used the app's previous rules. It found two superflex board bugs, which `b93a1ae` fixed: superflex was counted as QB-only when deciding required positions.

## Updating

Only when covered code or Sleeper's slot rules change on purpose:

1. Read the changed functions and check that the harness still matches them. `SLOT_ELIGIBILITY` must still match Sleeper's rules: change it only with a new source, and keep it independent of the app's table. Check that `setRemainingPicks` still reaches the code path `countRemainingUserPicks` uses, and that the P1 policy still matches the code. If the intended policy changed, update the property and say so in the change.
2. Run the check, and explain every failure as either a modeling change or a bug. Keep the runtime around 30 s.
3. Break the changed code in a scratch edit, confirm the check fails, then restore the file.
4. Only then move the sync commit to the commit you verified, and update **Read the result**. PRs are squash-merged, so branch commits disappear from `master`: use the `master` commit the change landed as, in a follow-up if needed.

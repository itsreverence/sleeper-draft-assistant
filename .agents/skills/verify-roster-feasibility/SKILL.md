---
name: verify-roster-feasibility
description: Exhaustively check the draft engine's starting-lineup feasibility rules (isDraftChoiceRosterFeasible and the required-position filter in buildDraftOptions) against a brute-force lineup matcher. Use when a change touches roster slots, flex or superflex handling, remaining-pick counting, or AI pick validation in packages/engine or draft-routes.ts.
---

# Verify roster feasibility

Two promises the engine makes during a draft:

- **P1. AI picks never strand the lineup.** `apps/api/src/routes/draft-routes.ts` rejects a Codex recommendation or alternative when `isDraftChoiceRosterFeasible` is false. If this function is wrong, users get told to draft a player that leaves a starter slot unfillable, or a valid pick is rejected.
- **P2. The reference board offers exactly the safe positions.** When the user's remaining picks are only just enough to fill the starting lineup, `buildDraftOptions` restricts the board to required positions and tags them `requiredToCompleteLineup` (shown as "Required starter position" on `CandidateCard`). If this is wrong, the board hides usable positions or leads with a pick that leaves a starter slot empty.

`packages/engine/verify/roster-feasibility.ts` enumerates every roster state within its bounds, calls the real exported functions, and compares them with a reference. The reference is Kuhn bipartite matching, which finds the starter slots left empty by the best assignment of rostered players. Slot eligibility follows `getEligiblePositions` in `apps/api/src/sleeper.ts`.

## Does the change touch it?

Rerun when a diff touches the functions under **Coverage**, `DraftState` roster or pick-order fields in `packages/shared/src/index.ts`, or the slot names accepted in `apps/api/src/format-compatibility.ts`. To see what changed since the verification was last confirmed:

```bash
git diff 6958fbf -- packages/engine/src/index.ts apps/api/src/routes/draft-routes.ts apps/api/src/sleeper.ts packages/shared/src/index.ts apps/api/src/format-compatibility.ts
```

Not every hunk matters: only the functions in **Coverage** and the fields above do. If a covered function changed and nobody rechecked it, follow **Updating** even when the check still prints the baseline.

## Run

```bash
npm run verify:roster-feasibility
npm run check -w @sleeper-draft-assistant/engine   # type-checks the harness and the engine
```

It takes about 6 s and needs no network or app data. It is not part of `npm test` because it fails on the known findings below.

## Read the result

The expected output at the sync commit is exactly:

```
Checked 622080 roster states (6 candidate positions each) in ~6s.
FAIL P2a buildDraftOptions hides a position that keeps the lineup completable: 40036 superflex case(s), 0 non-superflex case(s).
FAIL P2b buildDraftOptions offers a position that makes the lineup uncompletable: 22386 superflex case(s), 0 non-superflex case(s).
```

Each FAIL line is followed by a first superflex counterexample. There is no P1 line, and the process exits with code 1. Superflex and non-superflex cases are counted separately because the known findings are all superflex. Compare against this baseline:

- **Same output:** no behavior change inside the bounds.
- **A P1 line, a non-zero non-superflex count, or changed superflex counts:** behavior changed. Start with the non-superflex counterexample when one is printed. Each counterexample shows the starter slots, rostered counts, user picks left, and what the function returned versus the reference.
- **Decide whether it's a bug or a harness error.** Rebuild the counterexample by hand and ask whether the starting lineup can really be completed with that many picks. If it can't but the engine says it can (or the reverse), you've found a real bug. Report it in those terms and do not loosen the check to make it pass. If the harness built a state the app can't produce, fix `makeState` or `setRemainingPicks` and note why. For example, an empty `pickOrder.entries` makes `countRemainingUserPicks` fall back to snake math, which is why the harness always adds another team's closing pick.
- **Unintended change that breaks a property:** report it as a regression with the counterexample in draft terms, e.g. "with TE:1 FLEX:1 DEF:1 starters, two TEs rostered and one pick left, the board no longer restricts to DEF". Leave the baseline, the sync commit and the harness alone. The code needs fixing, not the check.
- **Fewer P2 cases:** the findings were partly or fully fixed. Confirm the counterexample is gone, then follow **Updating**.

## Known findings (open at the sync commit)

Both appear only in superflex leagues: the check passes with `SUPER_FLEX`/`SF` removed. `getDirectStarterGaps` counts superflex as a QB-only slot, so `getMandatoryCompletionPositions` disagrees with `getHardRequiredStarterGapCount`, which correctly lets surplus RB/WR/TE fill superflex.

- **P2a:** with one `SUPER_FLEX` starter slot, an empty roster and 1 pick left, the board offers only QB and tags it required. An RB, WR or TE would also complete the lineup.
- **P2b:** with `DEF:1 SUPER_FLEX:1`, a TE rostered and 1 pick left, the TE can fill superflex and only a DEF completes the lineup. The board does not restrict and offers every position, so its top reference option can leave DEF empty.

AI picks are still guarded by P1, which holds. Fixing the findings is product work, not part of running this check.

## Scope and assumptions

- **Bounds:**
  - starter slots QB 0–1, RB 0–2, WR 0–1, TE 0–1, DEF 0–1, K 0
  - one flex key: `FLEX` 0–2, `WR_RB_FLEX` 1, or `REC_FLEX` 1
  - one superflex key: `SUPER_FLEX` 0–1 or `SF` 1
  - rostered QB 0–2, RB 0–3, WR 0–2, TE 0–2, DEF 0–1, K 0
  - user picks left 0–3
  - one candidate of every position, including K
- **Why the bounds are small:** every engine quantity is a clipped difference, and these values reach both sides of each clip. K and DEF, and RB and WR, are handled identically by the covered functions, so one of each pair is varied less. A pass covers these bounds, not every league size.
- **Players are assumed available:** P1 assumes any position can be drafted later. The check does not model positional scarcity in the player pool.
- **P1 policy:** while the lineup can still be completed, a pick is accepted exactly when it stays completable. Once it can't (shortfall greater than picks left), only picks that shrink the shortfall are accepted (`index.ts` lines 141–143). P2 is checked only while the lineup is completable and at least one pick remains.
- **Remaining picks:** these come from Sleeper `pickOrder` entries only. The normal-snake fallback in `countRemainingUserPicks` is not covered.
- **Not covered:** `getRosterFit`, ordering and preferences in `buildDraftOptions` beyond which positions appear, IDP and unknown slots, bench limits, and whether Codex respects the rules.
- **Open question:** the app treats `WR_RB_FLEX` and `REC_FLEX` as RB/WR/TE slots. Sleeper's own semantics, and its exact slot names, were not confirmed. The check verifies the app's rule, not Sleeper's.

## Coverage

| Check | Code |
| --- | --- |
| P1 | `packages/engine/src/index.ts`: `isDraftChoiceRosterFeasible`, `getHardRequiredStarterGapCount`, `getDraftFlexSlotCount`, `countRemainingUserPicks` (Sleeper-order branch), `countRosterPositions`; consumer `apps/api/src/routes/draft-routes.ts` (strategy route validation) |
| P2 | `packages/engine/src/index.ts`: `buildDraftOptions`, `getMandatoryCompletionPositions`, `getDirectStarterGaps`, `getFlexibleStarterGap` |
| Reference | `apps/api/src/sleeper.ts`: `getEligiblePositions` (mirrored as `SLOT_ELIGIBILITY` in the harness) |

**Sync commit:** `6958fbf`, the last commit at which the covered code was confirmed to match the harness. The harness itself was added in the commit after it. It was confirmed to catch these scratch breaks in `index.ts`:

- dropping the superflex term from `getHardRequiredStarterGapCount` (P1 fails for every position)
- accepting non-reducing picks when the lineup is exactly tight (P1 fails)
- no longer requiring TE for flex completion (P2a rises)
- ignoring TE surplus in `getFlexibleStarterGap` (5451 non-superflex P2a and 4986 non-superflex P2b cases)

Changing `- 1` to nothing in the second branch of line 143 is not a break, because that branch is always true. Don't use it as a scratch test.

## Updating

Only when covered code changes on purpose, or a known finding is fixed:

1. Read the changed functions and check that the harness still matches them. Check that `SLOT_ELIGIBILITY` still matches `getEligiblePositions`, that `setRemainingPicks` still reaches the code path `countRemainingUserPicks` uses, and that the P1 policy still matches the code. If the intended policy changed, update the property and say so in the change.
2. Run the check. Explain every difference from the baseline as either a fix or a new finding, then update **Read the result** and **Known findings**.
3. Break the changed code in a scratch edit, confirm the check fails, then revert with `git checkout -- packages/engine/src/index.ts`.
4. Only then move the sync commit to the commit you verified.

// Exhaustive bounded check of the engine's roster-feasibility promises against a
// brute-force lineup matcher. Run with `npm run verify:roster-feasibility`.
// See .agents/skills/verify-roster-feasibility/SKILL.md for scope and findings.
import type { DraftState, Player, Position } from "@sleeper-draft-assistant/shared";
import { buildDraftOptions, isDraftChoiceRosterFeasible } from "../src/index";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

// Lineup semantics the app applies elsewhere: apps/api/src/sleeper.ts getEligiblePositions.
const SLOT_ELIGIBILITY: Record<string, Position[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WR_RB_FLEX: ["RB", "WR", "TE"], REC_FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"], SF: ["QB", "RB", "WR", "TE"],
};

type Counts = Record<Position, number>;
type Slots = Record<string, number>;

/** Starter slots left empty by the best possible assignment of rostered players. */
function unfilledStarters(slots: Slots, counts: Counts): number {
  const starters = Object.entries(slots).flatMap(([slot, n]) => SLOT_ELIGIBILITY[slot] ? Array<string>(n).fill(slot) : []);
  const players = POSITIONS.flatMap((position) => Array<Position>(counts[position]).fill(position));
  const slotOwner = new Array<number>(starters.length).fill(-1);
  const assign = (player: number, seen: boolean[]): boolean => {
    for (let s = 0; s < starters.length; s += 1) {
      if (seen[s] || !SLOT_ELIGIBILITY[starters[s]!]!.includes(players[player]!)) continue;
      seen[s] = true;
      if (slotOwner[s] === -1 || assign(slotOwner[s]!, seen)) {
        slotOwner[s] = player;
        return true;
      }
    }
    return false;
  };
  let matched = 0;
  for (let p = 0; p < players.length; p += 1) if (assign(p, new Array(starters.length).fill(false))) matched += 1;
  return starters.length - matched;
}

// Bounds: every engine quantity is a clipped difference (max(0, a - b)); these reach
// both sides of each clip. RB and WR are handled identically, so WR stays smaller; K and
// DEF are too, so K slots and rostered K stay at 0 (K candidates are still checked).
const MAX_COUNT: Counts = { QB: 2, RB: 3, WR: 2, TE: 2, K: 0, DEF: 1 };
const MAX_REMAINING = 3;
const USER = "user-team";
const OTHER = "other-team";

const rostered: Record<Position, Player[]> = Object.fromEntries(POSITIONS.map((position) => [
  position,
  Array.from({ length: MAX_COUNT[position] }, (_, index) => makePlayer(`rostered-${position}-${index}`, position)),
])) as Record<Position, Player[]>;
const candidates = POSITIONS.map((position) => makePlayer(`candidate-${position}`, position));

function makePlayer(id: string, position: Position): Player {
  return { id, sleeperId: id, name: id, team: "VER", position, projectedPoints: 1, projectionSource: "season_projection", adp: 1, tier: 1, riskTags: [], importedRank: 1 };
}

function makeState(slots: Slots, counts: Counts): DraftState {
  const roster = POSITIONS.flatMap((position) => rostered[position].slice(0, counts[position]));
  const currentPick = roster.length + 1;
  return {
    id: "verify", name: "verify", status: "drafting", currentPick, userTeamId: USER,
    settings: { teams: 1, rounds: roster.length + MAX_REMAINING, scoring: "PPR", rosterSlots: { ...slots, BN: 1 } },
    teams: [
      { id: USER, name: USER, draftSlot: 1, roster: roster.map((player) => player.id) },
      { id: OTHER, name: OTHER, draftSlot: 2, roster: [] },
    ],
    players: [...roster, ...candidates],
    picks: roster.map((player, index) => ({ pickNo: index + 1, round: index + 1, draftSlot: 1, teamId: USER, playerId: player.id })),
    pickOrder: { source: "sleeper", entries: [] },
    updatedAt: "2026-10-22T00:00:00.000Z",
  };
}

// Remaining user picks come from Sleeper pick-order entries (countRemainingUserPicks).
// Empty entries fall back to snake math, so another team's pick always closes the order.
function setRemainingPicks(state: DraftState, remaining: number) {
  const entry = (offset: number, teamId: string) => ({
    pickNo: state.currentPick + offset, round: state.currentPick + offset, draftSlot: teamId === USER ? 1 : 2, teamId, originalTeamId: teamId, isTraded: false,
  });
  state.pickOrder!.entries = [...Array.from({ length: remaining }, (_, index) => entry(index, USER)), entry(remaining, OTHER)];
}

function* range(max: number): Generator<number> { for (let n = 0; n <= max; n += 1) yield n; }

function* slotConfigs(): Generator<Slots> {
  for (const QB of range(1)) for (const RB of range(2)) for (const WR of range(1)) for (const TE of range(1))
    for (const K of range(0)) for (const DEF of range(1))
      for (const [flexKey, flexMax] of [["FLEX", 2], ["WR_RB_FLEX", 1], ["REC_FLEX", 1]] as const) for (const flex of range(flexMax))
        for (const [sfKey, sfMax] of [["SUPER_FLEX", 1], ["SF", 1]] as const) for (const sf of range(sfMax)) {
          if ((flexKey !== "FLEX" && flex === 0) || (sfKey !== "SUPER_FLEX" && sf === 0)) continue;
          yield { QB, RB, WR, TE, K, DEF, [flexKey]: flex, [sfKey]: sf };
        }
}

function* rosterCounts(): Generator<Counts> {
  for (const QB of range(MAX_COUNT.QB)) for (const RB of range(MAX_COUNT.RB)) for (const WR of range(MAX_COUNT.WR))
    for (const TE of range(MAX_COUNT.TE)) for (const K of range(MAX_COUNT.K)) for (const DEF of range(MAX_COUNT.DEF))
      yield { QB, RB, WR, TE, K, DEF };
}

// Known findings are superflex-only, so non-superflex violations are tallied apart:
// any non-zero non-superflex count is new behavior.
type Violation = { property: string; slots: Slots; counts: Counts; remaining: number; detail: string };
type Tally = { count: number; first?: Violation };
const violations = new Map<string, { superflex: Tally; other: Tally }>();
function report(violation: Violation) {
  const entry = violations.get(violation.property) ?? { superflex: { count: 0 }, other: { count: 0 } };
  violations.set(violation.property, entry);
  const tally = (violation.slots.SUPER_FLEX ?? 0) + (violation.slots.SF ?? 0) > 0 ? entry.superflex : entry.other;
  tally.count += 1;
  tally.first ??= violation;
}

const started = performance.now();
let cases = 0;
for (const slots of slotConfigs()) {
  for (const counts of rosterCounts()) {
    const before = unfilledStarters(slots, counts);
    const after = Object.fromEntries(POSITIONS.map((position) => [
      position, unfilledStarters(slots, { ...counts, [position]: counts[position] + 1 }),
    ])) as Record<Position, number>;
    const state = makeState(slots, counts);
    for (const remaining of range(MAX_REMAINING)) {
      cases += 1;
      setRemainingPicks(state, remaining);

      // P1 (draft-routes.ts rejects AI picks this calls infeasible): while the lineup can
      // still be completed, a pick is accepted exactly when it stays completable. Once it
      // cannot, only picks that shrink the shortfall are accepted (index.ts:141-143).
      for (const position of POSITIONS) {
        const expected = before <= remaining ? after[position] <= remaining - 1 : after[position] < before;
        const actual = isDraftChoiceRosterFeasible(state, `candidate-${position}`);
        if (actual !== expected) {
          report({ property: `P1 isDraftChoiceRosterFeasible(${position})`, slots, counts, remaining,
            detail: `returned ${actual}, expected ${expected} (unfilled starters before=${before}, after=${after[position]})` });
        }
      }

      // P2: while the lineup can be completed, the reference board offers exactly the
      // positions whose pick keeps it completable.
      if (remaining >= 1 && before <= remaining) {
        const offered = new Set(buildDraftOptions(state, 100).map((option) => option.player.position));
        const expected = POSITIONS.filter((position) => after[position] <= remaining - 1);
        const missing = expected.filter((position) => !offered.has(position));
        const extra = [...offered].filter((position) => !expected.includes(position));
        if (missing.length > 0) {
          report({ property: "P2a buildDraftOptions hides a position that keeps the lineup completable", slots, counts, remaining,
            detail: `hidden ${missing.join(", ")}; offered ${[...offered].join(", ")}` });
        }
        if (extra.length > 0) {
          report({ property: "P2b buildDraftOptions offers a position that makes the lineup uncompletable", slots, counts, remaining,
            detail: `offered ${extra.join(", ")}; unfilled starters before=${before}` });
        }
      }
    }
  }
}

console.log(`Checked ${cases} roster states (${POSITIONS.length} candidate positions each) in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
if (violations.size === 0) {
  console.log("All properties hold within the bounds.");
} else {
  const nonZero = (record: Record<string, number>) => Object.entries(record).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(" ") || "none";
  for (const [property, { superflex, other }] of violations) {
    console.log(`\nFAIL ${property}: ${superflex.count} superflex case(s), ${other.count} non-superflex case(s).`);
    for (const [label, { first }] of [["superflex", superflex], ["non-superflex", other]] as const) {
      if (!first) continue;
      console.log(`  First ${label} counterexample:`);
      console.log(`    starter slots:   ${nonZero(first.slots)}`);
      console.log(`    rostered:        ${nonZero(first.counts)}`);
      console.log(`    user picks left: ${first.remaining}`);
      console.log(`    ${first.detail}`);
    }
  }
  process.exitCode = 1;
}

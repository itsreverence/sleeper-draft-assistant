# 2026 Week 1 data readiness

Research date: 2026-08-28

## Question

Which Week 1 fantasy-football inputs used by Sleeper Draft Assistant are available now, which should be refreshed later, and what evidence is still missing from the application?

## Sources and method

- First-party FantasyPros projection, ranking, injury, news, depth-chart, and API pages were checked directly on August 28, 2026.
- Sleeper's official API documentation was compared with its live NFL state, player, and trending endpoints.
- The NFL's official 2026 Week 1 schedule was used to distinguish preseason data from regular-season Week 1 data.
- Repository behavior was traced through [`apps/api/src/sleeper.ts`](../../apps/api/src/sleeper.ts), [`apps/api/src/weekly-projections-import.ts`](../../apps/api/src/weekly-projections-import.ts), [`apps/api/src/ros-rankings-import.ts`](../../apps/api/src/ros-rankings-import.ts), [`apps/api/src/ai/team-context.ts`](../../apps/api/src/ai/team-context.ts), [`packages/engine/src/team-data-readiness.ts`](../../packages/engine/src/team-data-readiness.ts), and [`apps/web/src/App.svelte`](../../apps/web/src/App.svelte).

## Conclusion

FantasyPros Week 1 projections are usable now for all six positions, but they should be treated as a readiness test rather than the final game-day import. FantasyPros 2026 rest-of-season rankings are not available yet. The current ROS pages fall back to draft rankings, so importing them would mislabel draft data as ROS evidence.

Sleeper correctly reports that the NFL is still in preseason. Its player map and global trending feeds already contain useful current evidence. The application now preserves roster, injury, practice, depth-chart, injury-start, and metadata-freshness fields as labeled evidence for the roster UI and Codex. The weekly FantasyPros link was made scoring-aware as part of this review. Preventing a draft-ranking export from being accepted as current-season ROS data remains the highest-priority import safeguard.

## Confirmed availability

### Week 1 projections are live

FantasyPros publishes Week 1 projection tables for [QB](https://www.fantasypros.com/nfl/projections/qb.php?week=1), [PPR RB](https://www.fantasypros.com/nfl/projections/rb.php?scoring=PPR&week=1), [PPR WR](https://www.fantasypros.com/nfl/projections/wr.php?scoring=PPR&week=1), [PPR TE](https://www.fantasypros.com/nfl/projections/te.php?scoring=PPR&week=1), [K](https://www.fantasypros.com/nfl/projections/k.php?week=1), and [DST](https://www.fantasypros.com/nfl/projections/dst.php?week=1). Each page showed a consensus update date of August 28, 2026 when checked.

The three reception-bearing positions must use the league's scoring variant. The application's “Open FantasyPros” weekly link now sends `PPR`, `HALF`, or `STD` for RB, WR, and TE. Custom leagues still open without a claimed scoring variant because FantasyPros cannot represent arbitrary Sleeper scoring in that URL.

The six FantasyPros Week 1 CSVs previously downloaded through the real export flow were replayed against Sleeper's live August 28 player map. The batch parsed 671 rows across QB, RB, WR, TE, K, and DST, matched 667, left 4 unmatched, and produced no ambiguous matches. This confirms the exported CSV shapes and current player matching without changing saved application data.

The official [2026 Week 1 schedule](https://www.nfl.com/schedules/2026/by-week/reg-1) begins in September. Projections imported on August 28 are useful for testing file parsing, player matching, position coverage, and roster coverage. They should be downloaded again close to kickoff to incorporate role, roster, and injury changes. The application already treats a weekly import as stale after three days.

### 2026 ROS rankings are not live

The official FantasyPros [PPR](https://www.fantasypros.com/nfl/rankings/ros-ppr-overall.php), [Half-PPR](https://www.fantasypros.com/nfl/rankings/ros-half-point-ppr-overall.php), and [standard](https://www.fantasypros.com/nfl/rankings/ros-overall.php) ROS routes currently identify their data as 2026 draft rankings and say updated ROS rankings will follow Week 1. The canonical [ROS rankings view](https://www.fantasypros.com/nfl/rankings/?scoring=PPR&type=ros) also did not provide a current 2026 ROS dataset when checked.

Do not import a CSV from these pages as 2026 ROS evidence yet. The current importer validates CSV structure, player matching, season, and scoring selections supplied by the user. It does not verify that the export itself is an ROS dataset. Its freshness timestamp records when the user imported the file, not when FantasyPros produced the underlying rankings. A freshly imported draft export could therefore appear to be fresh ROS data.

### Sleeper is still in preseason

Sleeper's live [`/state/nfl`](https://api.sleeper.app/v1/state/nfl) response reported season `2026`, season type `pre`, week `3`, display week `3`, and leg `0` on August 28. The application is correct to suppress regular-season weekly advice while `season_type` is preseason. A scheduled Week 1 matchup may already exist in Sleeper, but it is upcoming context rather than the active fantasy week.

Sleeper's official [API documentation](https://docs.sleeper.com/) confirms that league matchups expose starters and player IDs, league transactions expose adds, drops, waivers, and trades, the NFL player map contains player metadata, and trending endpoints expose recent global adds and drops. The live [trending-add endpoint](https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=25) is already returning activity.

### Injury and depth-chart evidence exists

FantasyPros currently publishes [injuries](https://www.fantasypros.com/nfl/players/injuries.php), [injury news](https://www.fantasypros.com/nfl/injury-news.php), [player news](https://www.fantasypros.com/nfl/player-news.php), and [depth charts](https://www.fantasypros.com/nfl/depth-charts.php). These are FantasyPros-curated sources, not official club injury reports.

Sleeper's documented player map includes `injury_status`, `practice_participation`, `news_updated`, `depth_chart_position`, and `depth_chart_order`, and advises clients to cache the full player list no more than once per day. Those fields are present in the live player dataset. The application's 24-hour player cache follows that guidance.

FantasyPros also offers an official authenticated [API](https://www.fantasypros.com/api-data/) with [public v2 documentation](https://api.fantasypros.com/public/v2/docs) for rankings, projections, injuries, and news. It is a possible future integration, but production use depends on plan and licensing terms. Any integration would need a user-supplied key, local secret storage, and a review of redistribution restrictions.

## Exact gaps in the current evidence model

| Gap | Current behavior | Consequence |
| --- | --- | --- |
| ROS fallback is not detected | A structurally valid draft-ranking CSV can be accepted through the ROS importer. | Draft rankings can be presented to Codex as current ROS evidence. |
| Freshness means import time | Weekly and ROS freshness are calculated from `appliedAt`. | An old downloaded file looks fresh immediately after import. |
| Sleeper status evidence is labeled metadata | Player conversion preserves roster, injury, practice, depth-chart, injury-start, and metadata-update fields for rostered and inferred-available players. | Codex can reason from the fields but must not treat `news_updated` as an article or infer a cause that Sleeper did not provide. |
| No article or transaction-specific news context | Team context contains roster facts, projections, rankings, matchups, recent transactions, and global trends, but no sourced news item. | Codex must stay conservative about why a player's role or health changed. |
| Preseason league activity is hidden | The preseason gate sets the active regular-season week to null, so league transactions are not requested; global trending still works. | Team-specific adds, drops, waivers, and trades during preseason are absent from AI context. |
| Scheduled Week 1 context is all-or-nothing | The app suppresses matchup context until regular season. | It avoids falsely calling Week 1 current, but cannot show a clearly labeled upcoming matchup. |
| Detailed projection statistics stop at storage | The importer parses position-specific stat lines, while shared player and AI evidence primarily expose projected points. | Codex cannot use the projection's volume assumptions when two players have similar point totals. |

The missing fields should remain evidence, not become a parallel deterministic recommendation system. Availability, matching, feasibility, source labeling, and response validation should stay deterministic; player strategy should remain with Codex.

## Recommended sequence

1. Download and import all six Week 1 projection files now, with explicit PPR pages for RB, WR, and TE. Use the result to verify parsing, matching, six-position coverage, and roster coverage.
2. Refresh the six files again within the final few days before Week 1. Treat the later import as the operational dataset.
3. Do not import ROS rankings until FantasyPros explicitly labels the data as 2026 ROS. Recheck after Week 1.
4. Keep the scoring-aware weekly link covered for PPR, Half-PPR, and standard leagues. Add a guard or warning for draft data submitted through the ROS workflow.
5. Keep Sleeper status fields as labeled evidence, with actionable warnings inline and routine depth-chart metadata available on hover. Separately consider preseason league transactions and an “upcoming Week 1” view without weakening the preseason gate.
6. Evaluate the FantasyPros API only as a later product decision. Confirm licensing first, then preserve the local-first and user-supplied-credential boundaries.

## Source limitations

- Projection and ranking availability is a point-in-time finding from August 28, 2026. FantasyPros can refresh or replace these datasets without changing the route.
- FantasyPros injury and depth-chart pages are current editorial aggregations, not official NFL or team injury reports.
- Sleeper's public API is live and read-only, but its documented fields do not guarantee that every player record has every optional field populated.
- No user-specific league ID, roster, or matchup data is recorded in this note.

# 2026 Week 1 data readiness

> Implementation update (September 2, 2026): the season-value importer now distinguishes the known FantasyPros Draft ECR and ROS ECR header signatures, labels Draft ECR as provisional fallback evidence, and prevents it from replacing active ROS ECR. The first real 2026 ROS export still needs replay validation when it becomes available.

Research date: 2026-08-29

## Question

Which Week 1 fantasy-football inputs used by Sleeper Draft Assistant are available now, which should be refreshed later, and what evidence is still missing from the application?

## Sources and method

- First-party FantasyPros projection, ranking, injury, news, depth-chart, and API pages were checked directly on August 29, 2026.
- Sleeper's official API documentation was compared with its live NFL state, player, and trending endpoints.
- The NFL's official 2026 Week 1 schedule was used to distinguish preseason data from regular-season Week 1 data.
- Repository behavior was traced through [`apps/api/src/sleeper.ts`](../../apps/api/src/sleeper.ts), [`apps/api/src/weekly-projections-import.ts`](../../apps/api/src/weekly-projections-import.ts), [`apps/api/src/ros-rankings-import.ts`](../../apps/api/src/ros-rankings-import.ts), [`apps/api/src/ai/team-context.ts`](../../apps/api/src/ai/team-context.ts), [`packages/engine/src/team-data-readiness.ts`](../../packages/engine/src/team-data-readiness.ts), and [`apps/web/src/App.svelte`](../../apps/web/src/App.svelte).

## Conclusion

FantasyPros Week 1 projections are live and updating for all six required positions. They are usable now, but should still be refreshed within three days of lineup decisions. FantasyPros does not yet expose a current 2026 rest-of-season dataset: its canonical PPR ROS view still identifies itself as the final 2025 ROS table. Users should wait until FantasyPros explicitly labels an export as 2026 ROS. This review does not add a persistent in-app ROS warning because the temporary source condition would eventually make that warning misleading.

Sleeper still reports preseason Week 3 with regular-season leg `0`. Its player map contains useful injury, roster-status, depth-chart, and metadata-freshness evidence, but practice participation is essentially unpopulated in this preseason snapshot. The application preserves these as labeled evidence for the roster UI and Codex; null practice data must remain unknown rather than being treated as full participation.

## Confirmed availability

### Week 1 projections are live

FantasyPros publishes Week 1 projection tables for [QB](https://www.fantasypros.com/nfl/projections/qb.php?week=1), [PPR RB](https://www.fantasypros.com/nfl/projections/rb.php?scoring=PPR&week=1), [PPR WR](https://www.fantasypros.com/nfl/projections/wr.php?scoring=PPR&week=1), [PPR TE](https://www.fantasypros.com/nfl/projections/te.php?scoring=PPR&week=1), [K](https://www.fantasypros.com/nfl/projections/k.php?week=1), and [DST](https://www.fantasypros.com/nfl/projections/dst.php?week=1). All six pages reported “Consensus last updated Aug 29, 2026” when checked.

The three reception-bearing positions must use the league's scoring variant. The application's “Open FantasyPros” weekly link now sends `PPR`, `HALF`, or `STD` for RB, WR, and TE. Custom leagues still open without a claimed scoring variant because FantasyPros cannot represent arbitrary Sleeper scoring in that URL.

The first-party tables still expose the positional shapes the importer models: QB passing plus rushing; RB rushing plus receiving; WR receiving plus rushing; TE receiving; K field goals and extra points; and DST sacks, turnovers, touchdowns, safeties, points allowed, yards allowed, and `FPTS`. The six real FantasyPros Week 1 CSVs downloaded during the August 28 check used the expected `Player`, `Team`, position-specific statistics, and trailing `FPTS` columns. Replaying that batch parsed 671 rows, matched 667, left 4 unmatched, and produced no ambiguous matches. A fresh authenticated CSV download was not available to this automated check, so the page shape is current while the export-file replay remains dated August 28.

The pages were checked again on September 1. QB and RB reported August 31 updates; WR, TE, K, and DST reported September 1 updates. Their visible table shapes still match the importer contracts above. This confirms the current page schema, but not a newly downloaded authenticated CSV export.

The official [2026 Week 1 schedule](https://www.nfl.com/schedules/2026/by-week/reg-1) begins in September. Projections imported on August 28 are useful for testing file parsing, player matching, position coverage, and roster coverage. They should be downloaded again close to kickoff to incorporate role, roster, and injury changes. The application treats a weekly import as stale after three days and excludes stale position files from roster, available-player, readiness, and Codex evidence while retaining the stored summary for replacement.

### 2026 ROS rankings are not live

The official FantasyPros [PPR](https://www.fantasypros.com/nfl/rankings/ros-ppr-overall.php), [Half-PPR](https://www.fantasypros.com/nfl/rankings/ros-half-point-ppr-overall.php), and [standard](https://www.fantasypros.com/nfl/rankings/ros-overall.php) routes exist, but did not expose a current 2026 ranking table in the unauthenticated response checked on August 29. More decisively, the canonical [PPR ROS rankings view](https://www.fantasypros.com/nfl/rankings/?scoring=PPR&type=ros) still identifies itself as “2025 Fantasy Football Rankings” and “Overall Rest of Season Rankings - Dec 31, 2025.” There is therefore no first-party evidence that a 2026 ROS export is ready.

That canonical view still showed the 2025 title and December 31, 2025 date when rechecked on September 1.

Do not import a CSV from these pages as 2026 ROS evidence yet. The current importer validates CSV structure, player matching, season, and scoring selections supplied by the user. It does not verify that the export itself is an ROS dataset. Its freshness timestamp records when the user imported the file, not when FantasyPros produced the underlying rankings. A freshly imported draft export could therefore appear to be fresh ROS data.

### Sleeper is still in preseason

Sleeper's live [`/state/nfl`](https://api.sleeper.app/v1/state/nfl) response reported season `2026`, season type `pre`, week `3`, display week `3`, leg `0`, and `season_start_date` `2026-08-06` on August 29. Sleeper's [state documentation](https://docs.sleeper.com/#get-nfl-state) defines `season_type` as `pre`, `regular`, or `post`, describes `leg` as the regular-season week, and warns that `display_week` can differ from `week`. The application is therefore correct to suppress current regular-season advice while `season_type` is preseason. A scheduled Week 1 matchup may already exist, but it is upcoming context rather than the active fantasy week.

Sleeper's official [API documentation](https://docs.sleeper.com/) confirms that league matchups expose starters and player IDs, league transactions expose adds, drops, waivers, and trades, the NFL player map contains player metadata, and trending endpoints expose recent global adds and drops. The live [trending-add endpoint](https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=25) is already returning activity.

### Injury and depth-chart evidence exists

FantasyPros currently publishes [injuries](https://www.fantasypros.com/nfl/players/injuries.php), [injury news](https://www.fantasypros.com/nfl/injury-news.php), [player news](https://www.fantasypros.com/nfl/player-news.php), and [depth charts](https://www.fantasypros.com/nfl/depth-charts.php). These are FantasyPros-curated sources, not official club injury reports.

Sleeper's [documented player map](https://docs.sleeper.com/#fetch-all-players) includes `status`, `injury_status`, `injury_start_date`, `practice_participation`, `news_updated`, `depth_chart_position`, and `depth_chart_order`, and advises clients to fetch the full player list no more than once per day. The application's 24-hour player cache follows that guidance.

The August 29 live map contained 12,225 records. Of those, 12,180 had `status`, 8,205 had `news_updated`, 2,985 had `depth_chart_position`, 1,806 had `depth_chart_order`, 732 had `injury_status`, only 1 had `practice_participation`, and none had `injury_start_date`. These are population counts, not quality guarantees. In particular, absence of `practice_participation` during preseason is not evidence that a player practiced fully, and `news_updated` remains only a timestamp rather than an article or explanation.

FantasyPros also offers an official authenticated [API](https://www.fantasypros.com/api-data/) with [public v2 documentation](https://api.fantasypros.com/public/v2/docs) for rankings, projections, injuries, and news. It is a possible future integration, but production use depends on plan and licensing terms. Any integration would need a user-supplied key, local secret storage, and a review of redistribution restrictions.

## Exact gaps in the current evidence model

| Gap | Current behavior | Consequence |
| --- | --- | --- |
| ROS fallback is not detected | A structurally valid draft-ranking CSV can be accepted through the ROS importer. | Draft rankings can be presented to Codex as current ROS evidence. |
| Freshness means import time | Weekly and ROS freshness are calculated from `appliedAt`. | An old downloaded file looks fresh immediately after import. |
| Weekly position depends on the selected/filename label | Batch upload infers QB/RB/WR/TE/K/DST from filenames and cross-checks that label against the CSV headers. | Misnamed or misselected files are now rejected instead of being interpreted with another position's column indexes. |
| Weekly shapes are positional and order-sensitive | The importer expects the current FantasyPros column sequence, including duplicate `ATT`, `YDS`, and `TDS` headers where applicable. | Unknown or reordered shapes are rejected; a provider format change requires an importer update before the file can be used. |
| Sleeper status evidence is labeled metadata | Player conversion preserves roster, injury, practice, depth-chart, injury-start, and metadata-update fields for rostered and inferred-available players. | Codex can reason from the fields but must not treat `news_updated` as an article or infer a cause that Sleeper did not provide. |
| Practice evidence is sparse before Week 1 | Only one live player record populated `practice_participation` on August 29. | Null practice status must be treated as unknown, not as full participation. |
| No article or transaction-specific news context | Team context contains roster facts, projections, rankings, matchups, recent transactions, and global trends, but no sourced news item. | Codex must stay conservative about why a player's role or health changed. |
| Preseason league activity is hidden | The preseason gate sets the active regular-season week to null, so league transactions are not requested; global trending still works. | Team-specific adds, drops, waivers, and trades during preseason are absent from AI context. |
| Scheduled Week 1 context is all-or-nothing | The app suppresses matchup context until regular season. | It avoids falsely calling Week 1 current, but cannot show a clearly labeled upcoming matchup. |
| Detailed projection statistics stop at storage | The importer parses position-specific stat lines, while shared player and AI evidence primarily expose projected points. | Codex cannot use the projection's volume assumptions when two players have similar point totals. |

The missing fields should remain evidence, not become a parallel deterministic recommendation system. Availability, matching, feasibility, source labeling, and response validation should stay deterministic; player strategy should remain with Codex.

## Recommended sequence

1. Download and import all six Week 1 projection files now, using the league's scoring pages for RB, WR, and TE. Verify each filename's inferred position plus its parsed, matched, unmatched, and ambiguous counts.
2. Refresh the six files within three days of the lineup decision. Treat the later import as the operational dataset.
3. Do not import ROS rankings until FantasyPros explicitly labels the data as 2026 ROS. Recheck after Week 1.
4. Keep the scoring-aware weekly link covered for PPR, Half-PPR, and standard leagues. Do not add a persistent ROS warning for the temporary source-page fallback; import only when FantasyPros explicitly labels the export as current 2026 ROS data.
5. Keep Sleeper status fields as labeled evidence, with actionable warnings inline and routine depth-chart metadata available on hover. Separately consider preseason league transactions and an “upcoming Week 1” view without weakening the preseason gate.
6. Evaluate the FantasyPros API only as a later product decision. Confirm licensing first, then preserve the local-first and user-supplied-credential boundaries.

## Source limitations

- Projection and ranking availability is a point-in-time finding last rechecked on September 1, 2026. FantasyPros can refresh or replace these datasets without changing the route.
- The current FantasyPros tables were accessible without authentication, but a new authenticated CSV export was not downloaded during this check; CSV-shape confidence combines the current first-party tables with the August 28 real-export replay.
- FantasyPros injury and depth-chart pages are current editorial aggregations, not official NFL or team injury reports.
- Sleeper's public API is live and read-only, but its documented fields do not guarantee that every player record has every optional field populated.
- No user-specific league ID, roster, or matchup data is recorded in this note.

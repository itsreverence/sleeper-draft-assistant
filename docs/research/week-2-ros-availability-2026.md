# 2026 Week 2 ROS ECR availability

Research date: 2026-09-17

## Finding

Current 2026 PPR ROS ECR is now published. The unauthenticated HTML for the official [Overall PPR ROS page](https://www.fantasypros.com/nfl/rankings/ros-ppr-overall.php) identifies its embedded dataset with `ranking_type_name: ros`, `year: 2026`, `position_id: ALL`, `scoring: PPR`, `count: 404`, `total_experts: 6`, and `last_updated: 9/17`. Its injury context is Week 2. This supersedes the September 1 source-availability finding in [the Week 1 research note](week-1-data-readiness-2026.md), not that note's historical observations.

The page offers a CSV download button. Its registration check redirects signed-out users to sign-in. No authentication was bypassed, and no export was generated or downloaded during this check. The remaining validation input is a CSV downloaded by the user through FantasyPros while signed in. Publication of the page is **not** proof that the application's importer accepts the actual export. [Source: page HTML and inline registration handler](https://www.fantasypros.com/nfl/rankings/ros-ppr-overall.php).

## Export-format evidence and limits

The page's [first-party rankings JavaScript bundle](https://cdn.fantasypros.com/assets/js/min/pages/rankings/bundle-e4ffdb0c1abc30b9a5a1.js) implements CSV export from the currently visible table. It reads rendered headers and rows, skips cells marked for exclusion, conditionally adds tiers, separates the team from the player cell, escapes embedded quotes, and creates a local CSV download. Therefore table selections and visible columns can affect the output; there is no verified fixed CSV header or public static CSV URL from this investigation. This is source-code inspection, not a successful export replay.

## Actual export validation — September 24

The user supplied `FantasyPros_2026_Ros_ALL_Rankings.csv`. Its header is:

```text
"RK","PLAYER NAME",TEAM,"POS","SOS SEASON","SOS PLAYOFFS","ECR VS. ADP"
```

It contains 404 ranked players and two empty quoted rows. The importer previously required `BEST`, `WORST`, `AVG.`, and `STD.DEV`, a signature based on synthetic tests rather than a verified export. Classification now uses the verified ROS header, retains the distinct draft-fallback signature, and rejects ambiguous or unverified headers. Existing stored expert-statistics fields remain readable; this export leaves them null. Schedule-star columns identify the export but are not converted into expert-disagreement statistics or new recommendation scores.

An in-memory import of the actual attachment against the live public Sleeper player catalog matched **404/404**, with no unmatched or ambiguous rows. No saved user imports were changed. Synthetic regression fixtures exercise the same header, blank rows, missing statistics, Team Manager propagation, fallback replacement and downgrade protection, clear-to-fallback behavior, and SQLite reopening. The actual ranking data is not committed.

Season and scoring still come from the user's import selection and league compatibility checks: the CSV header does not encode either. This validates the supplied export, not every possible FantasyPros table configuration or future format.

## Method

Only first-party sources were used. Search extraction of the ROS page omitted most dynamic content, so the public HTML and its linked JavaScript were inspected directly in memory. No player rankings, provider credentials, or user-specific league data were saved in the repository. No application code or persisted imports were changed.

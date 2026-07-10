# Weekly Projections Follow-Up

Weekly projections are the next major feature track after the first alpha release. Draft rankings help draft-day advice, but season mode needs week-specific player value for lineup, waiver, and start/sit recommendations.

## Timing

FantasyPros weekly projections appear to be available closer to the regular season. Until exports are available for the target season/week, keep season mode explicit that it is using roster structure, ranks, and Sleeper data rather than true weekly projections.

## Target MVP

1. Add a `Weekly projections` import panel in Team Manager.
2. Support FantasyPros CSV exports first.
3. Persist imported projections by `leagueId`, `season`, and `week`.
4. Match rows to Sleeper players using the same normalized player matching approach as draft rankings.
5. Feed projected points, position rank, opponent, and injury/status fields into lineup, waiver, and AI context.
6. Show data quality: imported week, matched count, unmatched rows, and stale-week warning.

## Data model additions

- `weekly_projection_imports` keyed by league, season, week, source, and imported-at timestamp.
- Player-level projection fields: projected points, position rank, opponent, game date/time if present, injury/status if present, and source row metadata.
- Team Manager context should include projection recency and source so AI does not overstate confidence.

## UX rules

- Never silently treat draft rankings as weekly projections.
- If no weekly projection import exists, say so in lineup and waiver panels.
- If an import is for the wrong week, show a warning before using it.
- Let users clear or replace a weekly import without disturbing draft rankings.

## Validation

- Unit-test CSV parsing against real FantasyPros weekly export samples once available.
- Test name/team/position matching against Sleeper player IDs.
- Verify lineup suggestions change when projected points change.
- Verify AI context labels imported data as weekly projections, not draft rankings.

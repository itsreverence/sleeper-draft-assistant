import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import {
  SeasonValueRankingImportStore,
  applySeasonValueRankingsToPlayers,
  canReplaceSeasonValueRankings,
  classifyFantasyProsSeasonValueCsv,
  importFantasyProsSeasonValueRankings,
  isSeasonValueScoringCompatible,
  SeasonValueRankingImportError,
} from "./ros-rankings-import";
import { SqliteAppDatabase } from "./sqlite-app-database";

const rosCsv = `"RK","PLAYER NAME",TEAM,"POS","BEST","WORST","AVG.","STD.DEV","ECR VS. ADP"
"1","Jahmyr Gibbs",DET,"RB1","1","5","2.6","1.1","-"
"2","Josh Allen",BUF,"QB1","20","30","25.0","3.2","-"`;
const draftCsv = `"RK","TIERS","PLAYER NAME","TEAM","POS","BYE WEEK","ECR VS. ADP"
"1","1","Jahmyr Gibbs","DET","RB1","8","-"`;

describe("FantasyPros season value ranking imports", () => {
  it("requires the imported scoring format to match the league", () => {
    expect(isSeasonValueScoringCompatible("PPR", "PPR")).toBe(true);
    expect(isSeasonValueScoringCompatible("PPR", "Half PPR")).toBe(false);
    expect(isSeasonValueScoringCompatible("Custom", "PPR")).toBe(false);
  });

  it("imports overall ranks and expert disagreement", () => {
    const players = createMockDraftState(0).players;
    const storedImport = importFantasyProsSeasonValueRankings({
      players,
      season: "2025",
      scoring: "PPR",
      csvText: rosCsv,
    });
    const rankedPlayers = applySeasonValueRankingsToPlayers(players, storedImport);

    expect(storedImport.summary).toMatchObject({
      rankingType: "ros-ecr",
      rankingOrigin: "team-import",
      season: "2025",
      scoring: "PPR",
      rowsParsed: 2,
      matched: 2,
    });
    expect(rankedPlayers.find((player) => player.name === "Jahmyr Gibbs")).toMatchObject({
      rosRank: 1,
      rosPositionRank: 1,
      rosBestRank: 1,
      rosWorstRank: 5,
      rosAverageRank: 2.6,
      rosStdDev: 1.1,
      rosSource: "FantasyPros",
    });
  });

  it("classifies draft ECR as provisional fallback without presenting it as ROS", () => {
    const players = createMockDraftState(0).players;
    const storedImport = importFantasyProsSeasonValueRankings({
      players,
      season: "2026",
      scoring: "PPR",
      csvText: draftCsv,
    });
    const rankedPlayers = applySeasonValueRankingsToPlayers(players, storedImport);
    const gibbs = rankedPlayers.find((player) => player.name === "Jahmyr Gibbs");

    expect(storedImport.summary.rankingType).toBe("draft-ecr-fallback");
    expect(gibbs).toMatchObject({
      importedRank: 1,
      importedPositionRank: 1,
      importedSource: "FantasyPros draft ECR fallback",
    });
    expect(gibbs?.rosRank).toBeUndefined();
  });

  it("rejects an unrecognized rankings export", () => {
    expect(() => classifyFantasyProsSeasonValueCsv("RK,PLAYER NAME,TEAM,POS\n1,Player,SEA,WR1"))
      .toThrow(SeasonValueRankingImportError);
  });

  it("never lets draft fallback downgrade active ROS ECR", () => {
    const players = createMockDraftState(0).players;
    const ros = importFantasyProsSeasonValueRankings({ players, season: "2026", scoring: "PPR", csvText: rosCsv });
    const fallback = importFantasyProsSeasonValueRankings({ players, season: "2026", scoring: "PPR", csvText: draftCsv });

    expect(canReplaceSeasonValueRankings(ros, fallback)).toBe(false);
    expect(canReplaceSeasonValueRankings(fallback, ros)).toBe(true);
    expect(canReplaceSeasonValueRankings(null, fallback)).toBe(true);
  });

  it("persists draft ECR fallback by league, season, and scoring", async () => {
    const players = createMockDraftState(0).players;
    const dir = mkdtempSync(path.join(tmpdir(), "sda-ros-rankings-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const store = new SeasonValueRankingImportStore(path.join(dir, "ros.json"), database);
    const key = { leagueId: "league-1", season: "2025", scoring: "PPR" as const };

    store.set(key, importFantasyProsSeasonValueRankings({ players, season: "2025", scoring: "PPR", csvText: draftCsv }));

    const reopenedDatabase = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const reopened = new SeasonValueRankingImportStore(path.join(dir, "ros.json"), reopenedDatabase);
    expect(reopened.get(key)?.summary).toMatchObject({
      rankingType: "draft-ecr-fallback",
      rankingOrigin: "team-import",
      matched: 1,
    });
  });
});

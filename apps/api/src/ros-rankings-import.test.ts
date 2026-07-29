import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import {
  RosRankingImportStore,
  applyRosRankingsToPlayers,
  importFantasyProsRosRankings,
} from "./ros-rankings-import";
import { SqliteAppDatabase } from "./sqlite-app-database";

const rosCsv = `"RK","PLAYER NAME",TEAM,"POS","BEST","WORST","AVG.","STD.DEV","ECR VS. ADP"
"1","Jahmyr Gibbs",DET,"RB1","1","5","2.6","1.1","-"
"2","Josh Allen",BUF,"QB1","20","30","25.0","3.2","-"`;

describe("FantasyPros rest-of-season ranking imports", () => {
  it("imports overall ranks and expert disagreement", () => {
    const players = createMockDraftState(0).players;
    const storedImport = importFantasyProsRosRankings({
      players,
      season: "2025",
      scoring: "PPR",
      csvText: rosCsv,
    });
    const rankedPlayers = applyRosRankingsToPlayers(players, storedImport);

    expect(storedImport.summary).toMatchObject({
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

  it("persists rankings by league, season, and scoring", async () => {
    const players = createMockDraftState(0).players;
    const dir = mkdtempSync(path.join(tmpdir(), "sda-ros-rankings-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const store = new RosRankingImportStore(path.join(dir, "ros.json"), database);
    const key = { leagueId: "league-1", season: "2025", scoring: "PPR" as const };

    store.set(key, importFantasyProsRosRankings({ players, season: "2025", scoring: "PPR", csvText: rosCsv }));

    const reopenedDatabase = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const reopened = new RosRankingImportStore(path.join(dir, "ros.json"), reopenedDatabase);
    expect(reopened.get(key)?.summary.matched).toBe(2);
  });
});

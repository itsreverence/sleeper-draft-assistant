import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Player } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import {
  WeeklyProjectionImportStore,
  applyWeeklyProjectionsToPlayers,
  importFantasyProsWeeklyProjectionCsv,
  isWeeklyProjectionImportActive,
  mergeWeeklyProjectionImports,
} from "./weekly-projections-import";
import { SqliteAppDatabase } from "./sqlite-app-database";

const qbCsv = `"Player","Team","ATT","CMP","YDS","TDS","INTS","ATT","YDS","TDS","FL","FPTS"
"??","","",""
"Jalen Hurts","PHI","27.6","19.0","218.4","1.6","0.5","8.9","40.9","0.8","0.3","23.1"`;

const rbCsv = `"Player","Team","ATT","YDS","TDS","REC","YDS","TDS","FL","FPTS"
"??","","",""
"Bijan Robinson","ATL","18.4","83.2","0.7","3.5","26.3","0.1","0.1","15.7"`;

const dstCsv = `"Player","Team","SACK","INT","FR","FF","TD","SAFETY","PA","YDS_AGN","FPTS"
"Denver Broncos","","3.1","0.8","0.6","1.0","0.2","0.1","17.2","291.9","8.3"`;

describe("FantasyPros weekly projection import", () => {
  it("parses duplicate-header QB and RB projection exports", () => {
    const players = [
      player("p-hurts", "Jalen Hurts", "PHI", "QB"),
      player("p-bijan", "Bijan Robinson", "ATL", "RB"),
    ];

    const qbImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: qbCsv,
    });
    const rbImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: rbCsv,
    });

    expect(qbImport.summary.rowsParsed).toBe(1);
    expect(qbImport.summary.matched).toBe(1);
    expect(qbImport.summary.position).toBe("QB");
    expect(qbImport.summary.positions).toEqual(["QB"]);
    expect(qbImport.summary.positionResults).toEqual([
      expect.objectContaining({ position: "QB", rowsParsed: 1, matched: 1, unmatched: 0, ambiguous: 0 }),
    ]);
    expect(qbImport.playersById.get("p-hurts")?.projectedPoints).toBe(23.1);
    expect(qbImport.playersById.get("p-hurts")?.stats.passYards).toBe(218.4);
    expect(qbImport.playersById.get("p-hurts")?.stats.rushYards).toBe(40.9);

    expect(rbImport.summary.rowsParsed).toBe(1);
    expect(rbImport.summary.matched).toBe(1);
    expect(rbImport.summary.position).toBe("RB");
    expect(rbImport.playersById.get("p-bijan")?.stats.rushYards).toBe(83.2);
    expect(rbImport.playersById.get("p-bijan")?.stats.receivingYards).toBe(26.3);
  });

  it("merges separate position imports without losing the rest of the week", () => {
    const players = [
      player("1", "Josh Allen", "BUF", "QB"),
      player("2", "Bijan Robinson", "ATL", "RB"),
    ];
    const qbImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: `Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nJosh Allen,BUF,31.2,20.1,218.4,1.6,0.8,6.1,40.9,0.4,0.2,20.1`,
      position: "QB",
    });
    const rbImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: `Player,Team,ATT,YDS,TDS,REC,YDS,TDS,FL,FPTS\nBijan Robinson,ATL,16.8,83.2,0.7,4.3,26.3,0.2,0.1,19.4`,
      position: "RB",
    });

    const merged = mergeWeeklyProjectionImports(qbImport, rbImport);

    expect(merged.summary.position).toBeNull();
    expect(merged.summary.positions).toEqual(["QB", "RB"]);
    expect(merged.summary.positionResults.map((result) => result.position)).toEqual(["QB", "RB"]);
    expect(merged.summary.rowsParsed).toBe(2);
    expect(merged.summary.matched).toBe(2);
    expect(merged.playersById.get("1")?.projectedPoints).toBe(20.1);
    expect(merged.playersById.get("2")?.projectedPoints).toBe(19.4);
  });

  it("replaces per-position counts instead of accumulating re-imported rows", () => {
    const players = [
      player("1", "Josh Allen", "BUF", "QB"),
      player("2", "Jalen Hurts", "PHI", "QB"),
    ];
    const firstImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2026",
      week: 1,
      csvText: `Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nJosh Allen,BUF,31,20,220,2,1,6,35,1,0,24`,
      position: "QB",
    });
    const replacementImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2026",
      week: 1,
      csvText: `Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nJosh Allen,BUF,31,20,220,2,1,6,35,1,0,25\nJalen Hurts,PHI,29,19,215,2,0,8,42,1,0,26`,
      position: "QB",
    });

    const merged = mergeWeeklyProjectionImports(firstImport, replacementImport);

    expect(merged.summary.rowsParsed).toBe(2);
    expect(merged.summary.matched).toBe(2);
    expect(merged.summary.positionResults).toEqual([
      expect.objectContaining({ position: "QB", rowsParsed: 2, matched: 2 }),
    ]);
    expect(merged.playersById.get("1")?.projectedPoints).toBe(25);
  });

  it("only activates projections for the connected league season and selected week", () => {
    const players = [player("1", "Josh Allen", "BUF", "QB")];
    const historicalImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: `Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nJosh Allen,BUF,31,20,220,2,1,6,35,1,0,24`,
      position: "QB",
    });
    const currentImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2026",
      week: 2,
      csvText: `Player,Team,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS\nJosh Allen,BUF,31,20,220,2,1,6,35,1,0,25`,
      position: "QB",
    });
    const state = {
      league: { season: "2026" },
      week: 1,
    } as Parameters<typeof isWeeklyProjectionImportActive>[0];

    expect(isWeeklyProjectionImportActive(state, historicalImport, 1)).toBe(false);
    expect(isWeeklyProjectionImportActive(state, currentImport, 1)).toBe(false);
    expect(isWeeklyProjectionImportActive(state, currentImport, 2)).toBe(true);
  });

  it("matches FantasyPros DST rows to Sleeper DEF players", () => {
    const players = [player("def-den", "Denver Broncos", "DEN", "DEF")];
    const storedImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: dstCsv,
    });
    const projectedPlayers = applyWeeklyProjectionsToPlayers(players, storedImport);

    expect(storedImport.summary.position).toBe("DEF");
    expect(storedImport.summary.matched).toBe(1);
    expect(projectedPlayers[0]).toMatchObject({
      projectedPoints: 8.3,
      projectionSource: "weekly_projection",
      weeklyProjectedPoints: 8.3,
      weeklyProjectionSource: "FantasyPros",
      weeklyProjectionSeason: "2025",
      weeklyProjectionWeek: 1,
    });
  });

  it("matches common FantasyPros player aliases", () => {
    const players = [
      player("brown", "Marquise Brown", "PHI", "WR"),
      player("knight", "Zonovan Knight", "ARI", "RB"),
    ];
    const brownImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      position: "WR",
      csvText: `Player,Team,REC,YDS,TDS,ATT,YDS,TDS,FL,FPTS\nHollywood Brown,PHI,4,52,0.4,0,0,0,0,9.6`,
    });
    const knightImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      position: "RB",
      csvText: `Player,Team,ATT,YDS,TDS,REC,YDS,TDS,FL,FPTS\nBam Knight,ARI,6,24,0.1,1,8,0,0,4.8`,
    });

    expect(brownImport.playersById.has("brown")).toBe(true);
    expect(knightImport.playersById.has("knight")).toBe(true);
  });

  it("persists weekly projections by league season and week in SQLite", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-weekly-projections-"));
    const dbPath = path.join(dir, "app.sqlite");
    const players = [player("p-hurts", "Jalen Hurts", "PHI", "QB")];
    const database = await SqliteAppDatabase.open(dbPath);
    const firstStore = new WeeklyProjectionImportStore(path.join(dir, "legacy-weekly.json"), database);
    const storedImport = importFantasyProsWeeklyProjectionCsv({
      players,
      leagueId: "league-1",
      season: "2025",
      week: 1,
      csvText: qbCsv,
    });

    firstStore.set({ leagueId: "league-1", season: "2025", week: 1 }, storedImport);

    const secondDatabase = await SqliteAppDatabase.open(dbPath);
    const secondStore = new WeeklyProjectionImportStore(path.join(dir, "legacy-weekly.json"), secondDatabase);
    const reloaded = secondStore.get({ leagueId: "league-1", season: "2025", week: 1 });

    expect(reloaded?.summary.matched).toBe(1);
    expect(reloaded?.playersById.get("p-hurts")?.projectedPoints).toBe(23.1);
    expect(secondStore.delete({ leagueId: "league-1", season: "2025", week: 1 })).toBe(true);

    const thirdDatabase = await SqliteAppDatabase.open(dbPath);
    const thirdStore = new WeeklyProjectionImportStore(path.join(dir, "legacy-weekly.json"), thirdDatabase);
    expect(thirdStore.get({ leagueId: "league-1", season: "2025", week: 1 })).toBeNull();
  });
});

function player(id: string, name: string, team: string, position: Player["position"]): Player {
  return {
    id,
    sleeperId: id,
    name,
    team,
    position,
    projectedPoints: 0,
    projectionSource: "sleeper_search_rank",
    adp: null,
    tier: null,
    riskTags: [],
  };
}

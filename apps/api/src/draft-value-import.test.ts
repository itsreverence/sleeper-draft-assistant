import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { DraftState, Player } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import {
  AdpImportStore,
  SeasonProjectionImportStore,
  applyAdp,
  applySeasonProjections,
  importFantasyProsAdpCsv,
  importFantasyProsSeasonProjectionCsvs,
} from "./draft-value-import";
import { SqliteAppDatabase } from "./sqlite-app-database";

const qbCsv = `"Player","Team","ATT","CMP","YDS","TDS","INTS","ATT","YDS","TDS","FL","FPTS"
" ","","",""
"Josh Allen","BUF","500","330","4,000","30","10","100","500","10","2","365"`;

const rbCsv = `"Player","Team","ATT","YDS","TDS","REC","YDS","TDS","FL","FPTS"
"Jahmyr Gibbs","DET","250","1,000","10","50","500","5","1","163"`;

const kickerCsv = `"Player","Team","FG","FGA","XPT","FPTS"
"Brandon Aubrey","DAL","35","40","45","150"`;

const adpCsv = `Rank,Player (Bye),POS,Sleeper,RTSports,AVG,Real-Time
1,Jahmyr Gibbs   DET (6),RB1,2,-,2.0,1
2,Josh Allen   BUF (7),QB1,18,-,18.0,16`;

describe("FantasyPros draft value imports", () => {
  it("re-scores offensive season projections with Sleeper league scoring", () => {
    const state = withPlayer(
      withPprScoring(createMockDraftState(0)),
      player("p-aubrey", "Brandon Aubrey", "DAL", "K"),
    );
    const storedImport = importFantasyProsSeasonProjectionCsvs({
      state,
      season: "2026",
      files: [
        { position: "QB", csvText: qbCsv },
        { position: "RB", csvText: rbCsv },
        { position: "K", csvText: kickerCsv },
      ],
    });
    const importedState = applySeasonProjections(state, storedImport);
    const allen = importedState.players.find((player) => player.name === "Josh Allen");
    const gibbs = importedState.players.find((player) => player.name === "Jahmyr Gibbs");

    expect(storedImport.summary.rowsParsed).toBe(3);
    expect(storedImport.summary.matched).toBe(3);
    expect(storedImport.summary.approximatePositions).toEqual(["K"]);
    expect(allen).toMatchObject({
      projectedPoints: 376,
      projectionSource: "season_projection",
      seasonProjectionCoverage: "league_scored",
    });
    expect(gibbs).toMatchObject({
      projectedPoints: 288,
      projectionSource: "season_projection",
      seasonProjectionCoverage: "league_scored",
    });
    expect(importedState.players.find((player) => player.name === "Brandon Aubrey")).toMatchObject({
      projectedPoints: 150,
      seasonProjectionCoverage: "provider_approximation",
    });
  });

  it("imports Sleeper and Real-Time ADP as market signals", () => {
    const state = createMockDraftState(0);
    const storedImport = importFantasyProsAdpCsv({ state, season: "2026", csvText: adpCsv });
    const importedState = applyAdp(state, storedImport);

    expect(storedImport.summary).toMatchObject({
      market: "Sleeper",
      rowsParsed: 2,
      matched: 2,
      includesRealTime: true,
    });
    expect(importedState.players.find((player) => player.name === "Jahmyr Gibbs")).toMatchObject({
      adp: 2,
      realTimeAdp: 1,
      adpSource: "FantasyPros Sleeper ADP",
    });
  });

  it("persists draft value imports in SQLite", async () => {
    const state = withPprScoring(createMockDraftState(0));
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-ai-draft-values-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const projections = new SeasonProjectionImportStore(path.join(dir, "season.json"), database);
    const adp = new AdpImportStore(path.join(dir, "adp.json"), database);

    projections.set(state.id, importFantasyProsSeasonProjectionCsvs({
      state,
      season: "2026",
      files: [{ position: "QB", csvText: qbCsv }],
    }));
    adp.set(state.id, importFantasyProsAdpCsv({ state, season: "2026", csvText: adpCsv }));

    const reopenedDatabase = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const reopenedProjections = new SeasonProjectionImportStore(path.join(dir, "season.json"), reopenedDatabase);
    const reopenedAdp = new AdpImportStore(path.join(dir, "adp.json"), reopenedDatabase);

    expect(reopenedProjections.get(state.id)?.summary.matched).toBe(1);
    expect(reopenedAdp.get(state.id)?.summary.matched).toBe(2);
  });
});

function withPprScoring(state: DraftState): DraftState {
  return {
    ...state,
    settings: {
      ...state.settings,
      scoring: "PPR",
      scoringSettings: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -1,
        rush_yd: 0.1,
        rush_td: 6,
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        fum_lost: -2,
      },
    },
  };
}

function withPlayer(state: DraftState, addedPlayer: Player): DraftState {
  return {
    ...state,
    players: [...state.players, addedPlayer],
  };
}

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

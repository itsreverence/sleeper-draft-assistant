import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildDraftRecommendation, createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { DraftState, Player } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { RankingImportStore, applyImportedRankings, importFantasyProsCsv, isDraftRankingImportCompatible } from "./rankings-import";
import { SqliteAppDatabase } from "./sqlite-app-database";

const csv = `"RK",TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"
"1",1,"Jahmyr Gibbs",DET,"RB1","6","Coach Upside rating","Coach Bust rating","5 out of 5 stars","0"
"2",1,"Bijan Robinson",ATL,"RB2","11","Coach Upside rating","Coach Bust rating","2 out of 5 stars","+4"
"3",1,"Unknown Player",FA,"WR1","6","Coach Upside rating","Coach Bust rating","4 out of 5 stars","-"`;

describe("FantasyPros ranking import", () => {
  it("rejects scoring-specific rankings from a different league format", () => {
    const state = createMockDraftState(0);
    state.settings.scoring = "Standard";
    const storedImport = importFantasyProsCsv(state, csv, "PPR");

    expect(isDraftRankingImportCompatible(state, storedImport)).toBe(false);
  });

  it("matches FantasyPros rows to draft players and applies imported rank metadata", () => {
    const state = createMockDraftState(0);
    const storedImport = importFantasyProsCsv(state, csv);
    const importedState = applyImportedRankings(state, storedImport);
    const gibbs = importedState.players.find((player) => player.name === "Jahmyr Gibbs");
    const bijan = importedState.players.find((player) => player.name === "Bijan Robinson");

    expect(storedImport.summary.rowsParsed).toBe(3);
    expect(storedImport.summary.matched).toBe(2);
    expect(storedImport.summary.unmatched[0]?.name).toBe("Unknown Player");
    expect(gibbs?.projectionSource).toBe("imported");
    expect(gibbs?.importedRank).toBe(1);
    expect(gibbs?.importedPositionRank).toBe(1);
    expect(gibbs?.byeWeek).toBe(6);
    expect(bijan?.ecrVsAdp).toBe(4);
  });

  it("uses imported rank language in recommendations", () => {
    const state = createMockDraftState(0);
    const recommendationCsv = `"RK",TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"
"1",1,"Justin Jefferson",MIN,"WR1","6","Coach Upside rating","Coach Bust rating","5 out of 5 stars","0"
"2",1,"Jahmyr Gibbs",DET,"RB1","6","Coach Upside rating","Coach Bust rating","5 out of 5 stars","0"`;
    const storedImport = importFantasyProsCsv(state, recommendationCsv);
    const recommendation = buildDraftRecommendation(applyImportedRankings(state, storedImport));

    expect(recommendation.assumptions[0]).toContain("Imported");
    expect(recommendation.candidates[0]?.reasons[0]).toContain("FantasyPros rank");
  });

  it("persists ranking imports and reapplies them after a store restart", () => {
    const state = createMockDraftState(0);
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-rankings-")), "ranking-imports.json");
    const firstStore = new RankingImportStore(filePath);
    firstStore.set(state.id, importFantasyProsCsv(state, csv));

    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const secondStore = new RankingImportStore(filePath);
    const importedState = secondStore.apply(state.id, state);
    const gibbs = importedState.players.find((player) => player.name === "Jahmyr Gibbs");

    expect(raw[state.id]).toBeTruthy();
    expect(gibbs?.projectionSource).toBe("imported");
    expect(gibbs?.importedSource).toBe("FantasyPros");
  });

  it("clears persisted ranking imports for a draft", () => {
    const state = createMockDraftState(0);
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-rankings-")), "ranking-imports.json");
    const firstStore = new RankingImportStore(filePath);
    firstStore.set(state.id, importFantasyProsCsv(state, csv));

    expect(firstStore.delete(state.id)).toBe(true);

    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const secondStore = new RankingImportStore(filePath);
    const unimportedState = secondStore.apply(state.id, state);
    const gibbs = unimportedState.players.find((player) => player.name === "Jahmyr Gibbs");

    expect(raw[state.id]).toBeUndefined();
    expect(gibbs?.projectionSource).toBe("mock");
  });


  it("persists ranking imports in SQLite", async () => {
    const state = createMockDraftState(0);
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-ai-rankings-db-"));
    const dbPath = path.join(dir, "app.sqlite");
    const firstDatabase = await SqliteAppDatabase.open(dbPath);
    const firstStore = new RankingImportStore(path.join(dir, "legacy-ranking-imports.json"), firstDatabase);
    firstStore.set(state.id, importFantasyProsCsv(state, csv));

    const secondDatabase = await SqliteAppDatabase.open(dbPath);
    const secondStore = new RankingImportStore(path.join(dir, "legacy-ranking-imports.json"), secondDatabase);
    const importedState = secondStore.apply(state.id, state);
    const gibbs = importedState.players.find((player) => player.name === "Jahmyr Gibbs");

    expect(gibbs?.projectionSource).toBe("imported");
    expect(gibbs?.importedRank).toBe(1);
    expect(secondStore.delete(state.id)).toBe(true);

    const thirdDatabase = await SqliteAppDatabase.open(dbPath);
    const thirdStore = new RankingImportStore(path.join(dir, "legacy-ranking-imports.json"), thirdDatabase);
    expect(thirdStore.get(state.id)).toBeNull();
  });
  it("handles suffix, team alias, and DST position matching", () => {
    const state = withPlayers(createMockDraftState(0), [
      player("p-etienne", "Travis Etienne", "JAX", "RB"),
      player("p-defense", "Denver Broncos", "DEN", "DEF"),
    ]);
    const importCsv = `"RK",TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"
"1",1,"Travis Etienne Jr.",JAC,"RB1","8","","","3 out of 5 stars","0"
"2",1,"Denver Broncos",DEN,"DST1","12","","","4 out of 5 stars","0"`;
    const storedImport = importFantasyProsCsv(state, importCsv);
    const importedState = applyImportedRankings(state, storedImport);

    expect(storedImport.summary.matched).toBe(2);
    expect(importedState.players.find((candidate) => candidate.id === "p-etienne")?.projectionSource).toBe("imported");
    expect(importedState.players.find((candidate) => candidate.id === "p-defense")?.position).toBe("DEF");
    expect(importedState.players.find((candidate) => candidate.id === "p-defense")?.projectionSource).toBe("imported");
  });

  it("reports ambiguous matches when name and position match multiple Sleeper players", () => {
    const state = withPlayers(createMockDraftState(0), [
      player("p-1", "Chris Rodriguez", "WAS", "RB"),
      player("p-2", "Chris Rodriguez", "FA", "RB"),
    ]);
    const importCsv = `"RK",TIERS,"PLAYER NAME",TEAM,"POS","BYE WEEK","UPSIDE ","BUST ","SOS SEASON","ECR VS. ADP"
"1",1,"Chris Rodriguez",,"RB1","14","","","3 out of 5 stars","0"`;
    const storedImport = importFantasyProsCsv(state, importCsv);

    expect(storedImport.summary.matched).toBe(0);
    expect(storedImport.summary.ambiguous).toHaveLength(1);
    expect(storedImport.summary.ambiguous[0]?.candidates).toHaveLength(2);
  });
});

function withPlayers(state: DraftState, players: Player[]): DraftState {
  return {
    ...state,
    players,
    picks: [],
  };
}

function player(id: string, name: string, team: string, position: Player["position"]): Player {
  return {
    id,
    sleeperId: id,
    name,
    team,
    position,
    projectedPoints: 150,
    projectionSource: "sleeper_search_rank",
    adp: null,
    tier: null,
    riskTags: [],
  };
}


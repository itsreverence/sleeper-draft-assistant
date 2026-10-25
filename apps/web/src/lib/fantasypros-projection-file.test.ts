import { describe, expect, it } from "vitest";
import { inferFantasyProsProjectionPosition } from "./fantasypros-projection-file";

const headers = {
  K: "Player,Team,BYE,FG,FGA,XPT,FPTS",
  QB: "Player,Team,BYE,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS",
  DEF: "Player,Team,BYE,SACK,INT,FR,FF,TD,SAFETY,PA,YDS_AGN,FPTS",
};

describe("FantasyPros projection file position", () => {
  it.each([
    ["FantasyPros_Fantasy_Football_Projections_K.csv", "K"],
    ["FantasyPros_Fantasy_Football_Projections_K (4).csv", "K"],
    ["FantasyPros_Fantasy_Football_Projections_K(4).csv", "K"],
    ["FantasyPros_Fantasy_Football_Projections_DST (2).csv", "DEF"],
    ["fantasypros_projections_def(2).csv", "DEF"],
    ["fantasypros_projections_qb (4).csv", "QB"],
    ["FantasyPros_RB (4).csv", "RB"],
    ["FantasyPros_WR (4).csv", "WR"],
    ["FantasyPros_TE (4).csv", "TE"],
    ["QB.csv", "QB"],
    ["projections-K-week-2.csv", "K"],
  ])("identifies the delimited position in %s", (name, position) => {
    expect(inferFantasyProsProjectionPosition({ name, csv: "" })).toBe(position);
  });

  it.each([
    "Kicker.csv", "Rankings.csv", "FantasyPros_Kicker.csv", "Rankings_Team.csv",
    "Rankings_TEs.csv", "FantasyPros_QBackup.csv", "FantasyPros_DSTats.csv", "myTE.csv",
  ])("does not identify a position inside a word in %s", (name) => {
    expect(inferFantasyProsProjectionPosition({ name, csv: "Player,Team,FPTS" })).toBeNull();
  });

  it("identifies the actual unquoted kicker export with a duplicate-download suffix", () => {
    expect(inferFantasyProsProjectionPosition({
      name: "FantasyPros_Fantasy_Football_Projections_K (4).csv",
      csv: `${headers.K}\nBrandon Aubrey,DAL,14,34.8,39.5,47.0,151.4`,
    })).toBe("K");
  });

  it.each(Object.entries(headers))("identifies %s from an unquoted header", (position, csv) => {
    expect(inferFantasyProsProjectionPosition({ name: "export.csv", csv })).toBe(position);
  });

  it.each(Object.entries(headers))("identifies %s from trimmed, quoted, lowercase headers", (position, header) => {
    const csv = `\uFEFF${header.split(",").map((cell) => `" ${cell.toLowerCase()} "`).join(",")}\r\n`;
    expect(inferFantasyProsProjectionPosition({ name: "export.csv", csv })).toBe(position);
  });

  it("parses commas and escaped quotes inside header fields", () => {
    expect(inferFantasyProsProjectionPosition({
      name: "export.csv", csv: '"Player, ""FG""",Team,FGA,FPTS',
    })).toBeNull();
  });

  it("reads a complete first CSV row with a quoted newline", () => {
    expect(inferFantasyProsProjectionPosition({
      name: "export.csv", csv: '"Player\nname",Team,FG,FGA,FPTS\nExample,DAL,1,2,3',
    })).toBe("K");
  });

  it("does not infer a position from data rows or partial header names", () => {
    for (const csv of ["Player,Team,FPTS\nFG,FGA,1", "Player,Team,FG_PERCENT,FGA", "", "Player,Team,REC,YDS,TDS,FL,FPTS"]) {
      expect(inferFantasyProsProjectionPosition({ name: "export.csv", csv })).toBeNull();
    }
  });

  it("preserves filename precedence over the header fallback", () => {
    expect(inferFantasyProsProjectionPosition({ name: "FantasyPros_QB.csv", csv: headers.K })).toBe("QB");
  });
});

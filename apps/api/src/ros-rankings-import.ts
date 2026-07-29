import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DraftScoringFormat,
  Player,
  Position,
  RosRankingImportSummary,
  TeamManagerState,
} from "@sleeper-draft-assistant/shared";

import type { SqliteAppDatabase } from "./sqlite-app-database";
import { readPrivateTextFile, removePrivateFile, writePrivateFile } from "./secure-file";

export type RosRankingImportKey = {
  leagueId: string;
  season: string;
  scoring: DraftScoringFormat;
};

type ImportedRosRanking = {
  rank: number;
  positionRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: number | null;
  standardDeviation: number | null;
};

export type StoredRosRankingImport = {
  summary: RosRankingImportSummary;
  playersById: Map<string, ImportedRosRanking>;
};

type SerializedRosRankingImport = {
  summary: RosRankingImportSummary;
  players: Array<[string, ImportedRosRanking]>;
};

type RosRow = {
  rowNumber: number;
  name: string;
  team: string | null;
  position: Position | null;
  rank: number | null;
  positionRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: number | null;
  standardDeviation: number | null;
};

export class RosRankingImportStore {
  private readonly imports = new Map<string, StoredRosRankingImport>();

  constructor(
    private readonly filePath = getDefaultStorePath(),
    private readonly database?: SqliteAppDatabase,
  ) {
    this.load();
  }

  set(key: RosRankingImportKey, storedImport: StoredRosRankingImport) {
    const importKey = toRosImportKey(key);
    this.imports.set(importKey, storedImport);
    if (this.database) {
      this.database.setJson("ros_ranking_imports", importKey, serialize(storedImport));
    } else {
      this.saveFile();
    }
  }

  get(key: RosRankingImportKey): StoredRosRankingImport | null {
    return this.imports.get(toRosImportKey(key)) ?? null;
  }

  delete(key: RosRankingImportKey): boolean {
    const importKey = toRosImportKey(key);
    const deleted = this.imports.delete(importKey);
    if (deleted) {
      if (this.database) {
        this.database.deleteJson("ros_ranking_imports", importKey);
      } else {
        this.saveFile();
      }
    }
    return deleted;
  }

  clearAll(): number {
    const deleted = this.imports.size;
    this.imports.clear();
    if (this.database) {
      this.database.clearJson("ros_ranking_imports");
    } else {
      this.saveFile();
    }
    removePrivateFile(this.filePath);
    return deleted;
  }

  private load() {
    if (this.database) {
      const records = this.database.listJson<SerializedRosRankingImport>("ros_ranking_imports");
      if (records.length > 0) {
        for (const [key, value] of records) {
          this.imports.set(key, deserialize(value));
        }
        return;
      }
    }
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as Record<string, SerializedRosRankingImport>;
      for (const [key, value] of Object.entries(parsed)) {
        const storedImport = deserialize(value);
        this.imports.set(key, storedImport);
        this.database?.setJson("ros_ranking_imports", key, serialize(storedImport));
      }
    } catch {
      this.imports.clear();
    }
  }

  private saveFile() {
    const serialized = Object.fromEntries(
      Array.from(this.imports.entries()).map(([key, value]) => [key, serialize(value)]),
    );
    writePrivateFile(this.filePath, `${JSON.stringify(serialized, null, 2)}\n`);
  }
}

export function importFantasyProsRosRankings(input: {
  players: Player[];
  season: string;
  scoring: DraftScoringFormat;
  csvText: string;
}): StoredRosRankingImport {
  const rows = parseRosRows(input.csvText);
  const playersById = new Map<string, ImportedRosRanking>();
  const unmatched: RosRankingImportSummary["unmatched"] = [];
  const ambiguous: RosRankingImportSummary["ambiguous"] = [];

  for (const row of rows) {
    if (!row.rank || !row.position) {
      unmatched.push(toMatchIssue(row));
      continue;
    }
    const match = matchPlayer(row, input.players);
    if (match.kind === "matched") {
      playersById.set(match.player.id, {
        rank: row.rank,
        positionRank: row.positionRank,
        bestRank: row.bestRank,
        worstRank: row.worstRank,
        averageRank: row.averageRank,
        standardDeviation: row.standardDeviation,
      });
    } else if (match.kind === "ambiguous") {
      ambiguous.push({
        ...toMatchIssue(row),
        candidates: match.players.map((player) => `${player.name} (${player.team} ${player.position})`),
      });
    } else {
      unmatched.push(toMatchIssue(row));
    }
  }

  return {
    summary: {
      source: "fantasypros",
      season: input.season,
      scoring: input.scoring,
      rowsParsed: rows.length,
      matched: playersById.size,
      unmatched: unmatched.slice(0, 40),
      ambiguous: ambiguous.slice(0, 40),
      appliedAt: new Date().toISOString(),
    },
    playersById,
  };
}

export function applyRosRankingsToTeamState(
  state: TeamManagerState,
  storedImport: StoredRosRankingImport | null,
): TeamManagerState {
  if (!storedImport) {
    return state;
  }
  return {
    ...state,
    roster: {
      ...state.roster,
      starters: state.roster.starters.map((slot) => ({
        ...slot,
        player: slot.player ? applyRosRankingToPlayer(slot.player, storedImport) : null,
      })),
      bench: applyRosRankingsToPlayers(state.roster.bench, storedImport),
      injuredReserve: applyRosRankingsToPlayers(state.roster.injuredReserve, storedImport),
      taxi: applyRosRankingsToPlayers(state.roster.taxi, storedImport),
    },
    dataQuality: {
      ...state.dataQuality,
      playerValueSource: `FantasyPros ${storedImport.summary.season} ${storedImport.summary.scoring} rest-of-season ECR`,
      limitations: state.dataQuality.limitations.filter(
        (item) => !item.toLowerCase().includes("rest-of-season"),
      ),
    },
  };
}

export function applyRosRankingsToPlayers(
  players: Player[],
  storedImport: StoredRosRankingImport | null,
): Player[] {
  return storedImport
    ? players.map((player) => applyRosRankingToPlayer(player, storedImport))
    : players;
}

export function applyRosRankingToPlayer(
  player: Player,
  storedImport: StoredRosRankingImport,
): Player {
  const value = storedImport.playersById.get(player.id);
  if (!value) {
    return player;
  }
  return {
    ...player,
    rosRank: value.rank,
    rosPositionRank: value.positionRank,
    rosBestRank: value.bestRank,
    rosWorstRank: value.worstRank,
    rosAverageRank: value.averageRank,
    rosStdDev: value.standardDeviation,
    rosSource: "FantasyPros",
    rosSeason: storedImport.summary.season,
    rosScoring: storedImport.summary.scoring,
  };
}

export function isRosRankingImportActive(
  state: Pick<TeamManagerState, "league">,
  storedImport: StoredRosRankingImport | null,
): boolean {
  if (!storedImport || !state.league.season) {
    return false;
  }
  return storedImport.summary.season === state.league.season
    && isRosScoringCompatible(storedImport.summary.scoring, state.league.scoring);
}

export function normalizeScoringFormat(value: string): DraftScoringFormat {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ppr") return "PPR";
  if (normalized === "half ppr" || normalized === "half-ppr") return "Half PPR";
  if (normalized === "standard") return "Standard";
  return normalized ? "Custom" : "Unknown";
}

export function toRosImportKey(key: RosRankingImportKey): string {
  return `${key.leagueId}:${key.season}:${key.scoring}`;
}

export function isRosScoringCompatible(imported: DraftScoringFormat, leagueScoring: string): boolean {
  return imported === normalizeScoringFormat(leagueScoring);
}

function parseRosRows(csvText: string): RosRow[] {
  const [headers, ...records] = parseCsv(csvText.trim());
  if (!headers) {
    return [];
  }
  const indexes = new Map(
    headers.map((header, index) => [normalizeHeader(header), index]),
  );
  return records
    .map((record, index) => {
      const positionText = cell(record, indexes, "pos");
      const parsedPosition = parsePosition(positionText);
      return {
        rowNumber: index + 2,
        name: cleanText(cell(record, indexes, "playername")),
        team: nullableText(cell(record, indexes, "team")),
        position: parsedPosition.position,
        rank: numberFrom(cell(record, indexes, "rk")),
        positionRank: parsedPosition.rank,
        bestRank: numberFrom(cell(record, indexes, "best")),
        worstRank: numberFrom(cell(record, indexes, "worst")),
        averageRank: numberFrom(cell(record, indexes, "avg")),
        standardDeviation: numberFrom(cell(record, indexes, "stddev")),
      };
    })
    .filter((row) => row.name.length > 0);
}

function parsePosition(value: string): { position: Position | null; rank: number | null } {
  const match = cleanText(value).toUpperCase().match(/^(QB|RB|WR|TE|K|DST|DEF)(\d+)?$/);
  if (!match) {
    return { position: null, rank: null };
  }
  return {
    position: match[1] === "DST" ? "DEF" : match[1] as Position,
    rank: match[2] ? Number(match[2]) : null,
  };
}

function matchPlayer(row: RosRow, players: Player[]) {
  const normalizedName = normalizeName(row.name);
  const candidates = players.filter((player) =>
    player.position === row.position && normalizeName(player.name) === normalizedName,
  );
  const teamMatches = row.team
    ? candidates.filter((player) => normalizeTeam(player.team) === normalizeTeam(row.team!))
    : [];
  const matches = teamMatches.length > 0 ? teamMatches : candidates;
  if (matches.length === 1) {
    return { kind: "matched" as const, player: matches[0]! };
  }
  if (matches.length > 1) {
    return { kind: "ambiguous" as const, players: matches };
  }
  return { kind: "unmatched" as const };
}

function toMatchIssue(row: RosRow) {
  return {
    row: row.rowNumber,
    name: row.name,
    team: row.team,
    position: row.position,
  };
}

function normalizeName(name: string): string {
  const normalized = cleanText(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return playerNameAliases[normalized] ?? normalized;
}

const playerNameAliases: Record<string, string> = {
  bamknight: "zonovanknight",
  hollywoodbrown: "marquisebrown",
};

function normalizeTeam(team: string): string {
  return team.toUpperCase() === "JAC" ? "JAX" : team.toUpperCase();
}

function normalizeHeader(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cell(record: string[], indexes: Map<string, number>, header: string): string {
  const index = indexes.get(header);
  return index === undefined ? "" : record[index] ?? "";
}

function cleanText(value: string): string {
  return value.replace(/\u00c2/g, "").replace(/\u00a0/g, " ").trim();
}

function nullableText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function numberFrom(value: string): number | null {
  const cleaned = cleanText(value).replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cellValue += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cellValue);
      cellValue = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cellValue);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cellValue = "";
    } else {
      cellValue += char;
    }
  }
  row.push(cellValue);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function serialize(storedImport: StoredRosRankingImport): SerializedRosRankingImport {
  return {
    summary: storedImport.summary,
    players: Array.from(storedImport.playersById.entries()),
  };
}

function deserialize(value: SerializedRosRankingImport): StoredRosRankingImport {
  return {
    summary: value.summary,
    playersById: new Map(value.players),
  };
}

function getDefaultStorePath(): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "ros-ranking-imports.json")
    : path.join(repoRoot, "data", "ros-ranking-imports.json");
}

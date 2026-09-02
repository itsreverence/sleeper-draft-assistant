import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DraftScoringFormat,
  Player,
  Position,
  SeasonValueRankingImportSummary,
  SeasonValueRankingType,
  TeamManagerState,
} from "@sleeper-draft-assistant/shared";

import {
  rosRankingImportRecordCodec,
  type SerializedRosRankingImport,
} from "./persisted-domain-codecs";
import { persistedRecordError } from "./persisted-record";
import type { StoredRankingImport } from "./rankings-import";
import type { SqliteAppDatabase } from "./sqlite-app-database";
import { readPrivateTextFile, removePrivateFile, writePrivateFile } from "./secure-file";

export type SeasonValueRankingImportKey = {
  leagueId: string;
  season: string;
  scoring: DraftScoringFormat;
};

type ImportedSeasonValueRanking = {
  rank: number;
  positionRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: number | null;
  standardDeviation: number | null;
};

export type StoredSeasonValueRankingImport = {
  summary: SeasonValueRankingImportSummary;
  playersById: Map<string, ImportedSeasonValueRanking>;
};

type SeasonValueRow = {
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

export class SeasonValueRankingImportError extends Error {}

export class SeasonValueRankingImportStore {
  private readonly imports = new Map<string, StoredSeasonValueRankingImport>();

  constructor(
    private readonly filePath = getDefaultStorePath(),
    private readonly database?: SqliteAppDatabase,
  ) {
    this.load();
  }

  set(key: SeasonValueRankingImportKey, storedImport: StoredSeasonValueRankingImport) {
    const importKey = toSeasonValueImportKey(key);
    this.imports.set(importKey, storedImport);
    if (this.database) {
      this.database.setRecord("ros_ranking_imports", importKey, rosRankingImportRecordCodec, serialize(storedImport));
    } else {
      this.saveFile();
    }
  }

  get(key: SeasonValueRankingImportKey): StoredSeasonValueRankingImport | null {
    return this.imports.get(toSeasonValueImportKey(key)) ?? null;
  }

  delete(key: SeasonValueRankingImportKey): boolean {
    const importKey = toSeasonValueImportKey(key);
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
      const records = this.database.listRecords("ros_ranking_imports", rosRankingImportRecordCodec);
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
        const storedImport = deserialize(rosRankingImportRecordCodec.decode(value).data);
        this.imports.set(key, storedImport);
        this.database?.setRecord("ros_ranking_imports", key, rosRankingImportRecordCodec, serialize(storedImport));
      }
    } catch (error) {
      this.imports.clear();
      throw persistedRecordError(error, "season value ranking imports");
    }
  }

  private saveFile() {
    const serialized = Object.fromEntries(
      Array.from(this.imports.entries()).map(([key, value]) => [key, serialize(value)]),
    );
    writePrivateFile(this.filePath, `${JSON.stringify(serialized, null, 2)}\n`);
  }
}

export function importFantasyProsSeasonValueRankings(input: {
  players: Player[];
  season: string;
  scoring: DraftScoringFormat;
  csvText: string;
}): StoredSeasonValueRankingImport {
  const rankingType = classifyFantasyProsSeasonValueCsv(input.csvText);
  const rows = parseSeasonValueRows(input.csvText);
  const playersById = new Map<string, ImportedSeasonValueRanking>();
  const unmatched: SeasonValueRankingImportSummary["unmatched"] = [];
  const ambiguous: SeasonValueRankingImportSummary["ambiguous"] = [];

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
      rankingType,
      rankingOrigin: "team-import",
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

export function canReplaceSeasonValueRankings(
  existingImport: StoredSeasonValueRankingImport | null,
  incomingImport: StoredSeasonValueRankingImport,
): boolean {
  return existingImport?.summary.rankingType !== "ros-ecr"
    || incomingImport.summary.rankingType === "ros-ecr";
}

export function classifyFantasyProsSeasonValueCsv(csvText: string): SeasonValueRankingType {
  const [headers] = parseCsv(csvText.trim());
  if (!headers) {
    throw new SeasonValueRankingImportError("The selected rankings CSV is empty.");
  }
  const normalized = new Set(headers.map(normalizeHeader));
  const hasCore = ["rk", "playername", "team", "pos"].every((header) => normalized.has(header));
  const hasRosSignature = ["best", "worst", "avg", "stddev"].every((header) => normalized.has(header));
  const hasDraftSignature = ["tiers", "byeweek", "ecrvsadp"].every((header) => normalized.has(header));

  if (!hasCore || hasRosSignature === hasDraftSignature) {
    throw new SeasonValueRankingImportError(
      "Choose a FantasyPros Overall draft ECR or Overall rest-of-season rankings CSV.",
    );
  }
  return hasRosSignature ? "ros-ecr" : "draft-ecr-fallback";
}

export function toDraftEcrFallbackImport(
  storedImport: StoredRankingImport,
  season: string,
  scoring: DraftScoringFormat,
): StoredSeasonValueRankingImport {
  return {
    summary: {
      source: "fantasypros",
      rankingType: "draft-ecr-fallback",
      rankingOrigin: "draft-import",
      season,
      scoring,
      rowsParsed: storedImport.summary.rowsParsed,
      matched: storedImport.summary.matched,
      unmatched: storedImport.summary.unmatched,
      ambiguous: storedImport.summary.ambiguous,
      appliedAt: storedImport.summary.appliedAt,
    },
    playersById: new Map(Array.from(storedImport.playersById.entries()).map(([playerId, value]) => [playerId, {
      rank: value.rank,
      positionRank: value.positionRank,
      bestRank: null,
      worstRank: null,
      averageRank: null,
      standardDeviation: null,
    }])),
  };
}

export function applySeasonValueRankingsToTeamState(
  state: TeamManagerState,
  storedImport: StoredSeasonValueRankingImport | null,
): TeamManagerState {
  if (!storedImport) {
    return state;
  }
  const isFallback = storedImport.summary.rankingType === "draft-ecr-fallback";
  const retainedLimitations = state.dataQuality.limitations.filter((item) => {
    const normalized = item.toLowerCase();
    return !normalized.includes("rest-of-season") && !normalized.includes("draft ecr fallback");
  });
  return {
    ...state,
    roster: {
      ...state.roster,
      starters: state.roster.starters.map((slot) => ({
        ...slot,
        player: slot.player ? applySeasonValueRankingToPlayer(slot.player, storedImport) : null,
      })),
      bench: applySeasonValueRankingsToPlayers(state.roster.bench, storedImport),
      injuredReserve: applySeasonValueRankingsToPlayers(state.roster.injuredReserve, storedImport),
      taxi: applySeasonValueRankingsToPlayers(state.roster.taxi, storedImport),
    },
    dataQuality: {
      ...state.dataQuality,
      playerValueSource: isFallback
        ? `FantasyPros ${storedImport.summary.season} ${storedImport.summary.scoring} draft ECR fallback`
        : `FantasyPros ${storedImport.summary.season} ${storedImport.summary.scoring} rest-of-season ECR`,
      limitations: isFallback
        ? [...retainedLimitations, "Draft ECR fallback is provisional season-value evidence until current ROS ECR is imported."]
        : retainedLimitations,
    },
  };
}

export function applySeasonValueRankingsToPlayers(
  players: Player[],
  storedImport: StoredSeasonValueRankingImport | null,
): Player[] {
  return storedImport
    ? players.map((player) => applySeasonValueRankingToPlayer(player, storedImport))
    : players;
}

export function applySeasonValueRankingToPlayer(
  player: Player,
  storedImport: StoredSeasonValueRankingImport,
): Player {
  const value = storedImport.playersById.get(player.id);
  if (!value) {
    return player;
  }
  if (storedImport.summary.rankingType === "draft-ecr-fallback") {
    return {
      ...player,
      importedRank: value.rank,
      importedPositionRank: value.positionRank,
      importedSource: "FantasyPros draft ECR fallback",
    };
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

export function isSeasonValueRankingImportActive(
  state: Pick<TeamManagerState, "league">,
  storedImport: StoredSeasonValueRankingImport | null,
): boolean {
  if (!storedImport || !state.league.season) {
    return false;
  }
  return storedImport.summary.season === state.league.season
    && isSeasonValueScoringCompatible(storedImport.summary.scoring, state.league.scoring);
}

export function normalizeScoringFormat(value: string): DraftScoringFormat {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ppr") return "PPR";
  if (normalized === "half ppr" || normalized === "half-ppr") return "Half PPR";
  if (normalized === "standard") return "Standard";
  return normalized ? "Custom" : "Unknown";
}

export function toSeasonValueImportKey(key: SeasonValueRankingImportKey): string {
  return `${key.leagueId}:${key.season}:${key.scoring}`;
}

export function isSeasonValueScoringCompatible(imported: DraftScoringFormat, leagueScoring: string): boolean {
  return imported === normalizeScoringFormat(leagueScoring);
}

function parseSeasonValueRows(csvText: string): SeasonValueRow[] {
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

function matchPlayer(row: SeasonValueRow, players: Player[]) {
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

function toMatchIssue(row: SeasonValueRow) {
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

function serialize(storedImport: StoredSeasonValueRankingImport): SerializedRosRankingImport {
  return {
    summary: storedImport.summary,
    players: Array.from(storedImport.playersById.entries()),
  };
}

function deserialize(value: SerializedRosRankingImport): StoredSeasonValueRankingImport {
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

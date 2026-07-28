import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AdpImportSummary,
  DraftState,
  Player,
  Position,
  SeasonProjectionImportSummary,
} from "@sleeper-draft-assistant/shared";

import type { SqliteAppDatabase } from "./sqlite-app-database";
import { readPrivateTextFile, removePrivateFile, writePrivateFile } from "./secure-file";

type MatchIssue = {
  row: number;
  name: string;
  team: string | null;
  position: Position | null;
};

type AmbiguousMatchIssue = MatchIssue & {
  candidates: string[];
};

type SeasonProjectionValue = {
  points: number;
  coverage: "league_scored" | "provider_approximation";
};

type AdpValue = {
  sleeperAdp: number;
  realTimeAdp: number | null;
};

export type StoredSeasonProjectionImport = {
  summary: SeasonProjectionImportSummary;
  playersById: Map<string, SeasonProjectionValue>;
};

export type StoredAdpImport = {
  summary: AdpImportSummary;
  playersById: Map<string, AdpValue>;
};

type SerializedSeasonProjectionImport = {
  summary: SeasonProjectionImportSummary;
  players: Array<[string, SeasonProjectionValue]>;
};

type SerializedAdpImport = {
  summary: AdpImportSummary;
  players: Array<[string, AdpValue]>;
};

type ProjectionRow = {
  rowNumber: number;
  name: string;
  team: string | null;
  position: Position;
  stats: Record<string, number>;
  providerPoints: number | null;
};

type AdpRow = {
  rowNumber: number;
  name: string;
  team: string | null;
  position: Position | null;
  sleeperAdp: number | null;
  realTimeAdp: number | null;
};

const supportedPositions = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DEF"]);
const approximateProjectionPositions = new Set<Position>(["K", "DEF"]);

export class SeasonProjectionImportStore {
  private readonly imports = new Map<string, StoredSeasonProjectionImport>();

  constructor(
    private readonly filePath = getDefaultStorePath("season-projection-imports.json"),
    private readonly database?: SqliteAppDatabase,
  ) {
    this.load();
  }

  set(draftId: string, storedImport: StoredSeasonProjectionImport) {
    this.imports.set(draftId, storedImport);
    this.saveDraft(draftId, storedImport);
  }

  get(draftId: string): StoredSeasonProjectionImport | null {
    return this.imports.get(draftId) ?? null;
  }

  delete(draftId: string): boolean {
    const deleted = this.imports.delete(draftId);
    if (deleted) {
      if (this.database) {
        this.database.deleteJson("season_projection_imports", draftId);
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
      this.database.clearJson("season_projection_imports");
    } else {
      this.saveFile();
    }
    removePrivateFile(this.filePath);
    return deleted;
  }

  apply(draftId: string, state: DraftState): DraftState {
    const storedImport = this.get(draftId);
    return storedImport ? applySeasonProjections(state, storedImport) : state;
  }

  private load() {
    if (this.database) {
      for (const [draftId, storedImport] of this.database.listJson<SerializedSeasonProjectionImport>("season_projection_imports")) {
        this.imports.set(draftId, deserializeSeasonProjectionImport(storedImport));
      }
      if (this.imports.size > 0) {
        return;
      }
    }
    this.loadLegacyFile();
  }

  private loadLegacyFile() {
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as Record<string, SerializedSeasonProjectionImport>;
      for (const [draftId, storedImport] of Object.entries(parsed)) {
        const deserialized = deserializeSeasonProjectionImport(storedImport);
        this.imports.set(draftId, deserialized);
        this.database?.setJson("season_projection_imports", draftId, serializeSeasonProjectionImport(deserialized));
      }
    } catch {
      this.imports.clear();
    }
  }

  private saveDraft(draftId: string, storedImport: StoredSeasonProjectionImport) {
    if (this.database) {
      this.database.setJson("season_projection_imports", draftId, serializeSeasonProjectionImport(storedImport));
    } else {
      this.saveFile();
    }
  }

  private saveFile() {
    writePrivateFile(
      this.filePath,
      `${JSON.stringify(Object.fromEntries(
        Array.from(this.imports.entries()).map(([draftId, storedImport]) => [
          draftId,
          serializeSeasonProjectionImport(storedImport),
        ]),
      ), null, 2)}\n`,
    );
  }
}

export class AdpImportStore {
  private readonly imports = new Map<string, StoredAdpImport>();

  constructor(
    private readonly filePath = getDefaultStorePath("adp-imports.json"),
    private readonly database?: SqliteAppDatabase,
  ) {
    this.load();
  }

  set(draftId: string, storedImport: StoredAdpImport) {
    this.imports.set(draftId, storedImport);
    this.saveDraft(draftId, storedImport);
  }

  get(draftId: string): StoredAdpImport | null {
    return this.imports.get(draftId) ?? null;
  }

  delete(draftId: string): boolean {
    const deleted = this.imports.delete(draftId);
    if (deleted) {
      if (this.database) {
        this.database.deleteJson("adp_imports", draftId);
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
      this.database.clearJson("adp_imports");
    } else {
      this.saveFile();
    }
    removePrivateFile(this.filePath);
    return deleted;
  }

  apply(draftId: string, state: DraftState): DraftState {
    const storedImport = this.get(draftId);
    return storedImport ? applyAdp(state, storedImport) : state;
  }

  private load() {
    if (this.database) {
      for (const [draftId, storedImport] of this.database.listJson<SerializedAdpImport>("adp_imports")) {
        this.imports.set(draftId, deserializeAdpImport(storedImport));
      }
      if (this.imports.size > 0) {
        return;
      }
    }
    this.loadLegacyFile();
  }

  private loadLegacyFile() {
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as Record<string, SerializedAdpImport>;
      for (const [draftId, storedImport] of Object.entries(parsed)) {
        const deserialized = deserializeAdpImport(storedImport);
        this.imports.set(draftId, deserialized);
        this.database?.setJson("adp_imports", draftId, serializeAdpImport(deserialized));
      }
    } catch {
      this.imports.clear();
    }
  }

  private saveDraft(draftId: string, storedImport: StoredAdpImport) {
    if (this.database) {
      this.database.setJson("adp_imports", draftId, serializeAdpImport(storedImport));
    } else {
      this.saveFile();
    }
  }

  private saveFile() {
    writePrivateFile(
      this.filePath,
      `${JSON.stringify(Object.fromEntries(
        Array.from(this.imports.entries()).map(([draftId, storedImport]) => [
          draftId,
          serializeAdpImport(storedImport),
        ]),
      ), null, 2)}\n`,
    );
  }
}

export function importFantasyProsSeasonProjectionCsvs(input: {
  state: DraftState;
  season: string;
  files: Array<{ position: Position; csvText: string }>;
}): StoredSeasonProjectionImport {
  const playersById = new Map<string, SeasonProjectionValue>();
  const unmatched: MatchIssue[] = [];
  const ambiguous: AmbiguousMatchIssue[] = [];
  const positions: Position[] = [];
  let rowsParsed = 0;

  for (const file of input.files) {
    if (!positions.includes(file.position)) {
      positions.push(file.position);
    }
    const rows = parseProjectionRows(file.csvText, file.position);
    rowsParsed += rows.length;
    for (const row of rows) {
      const match = matchPlayer(row, input.state.players);
      if (match.kind === "matched") {
        const coverage = approximateProjectionPositions.has(row.position)
          ? "provider_approximation"
          : "league_scored";
        const points = coverage === "league_scored"
          ? scoreProjection(row, input.state)
          : row.providerPoints;
        if (points !== null) {
          playersById.set(match.player.id, { points: round(points), coverage });
        }
      } else if (match.kind === "ambiguous") {
        ambiguous.push({
          row: row.rowNumber,
          name: row.name,
          team: row.team,
          position: row.position,
          candidates: match.players.map(formatPlayerCandidate),
        });
      } else {
        unmatched.push({
          row: row.rowNumber,
          name: row.name,
          team: row.team,
          position: row.position,
        });
      }
    }
  }

  const approximatePositions = positions.filter((position) => approximateProjectionPositions.has(position));
  return {
    summary: {
      source: "fantasypros",
      season: input.season,
      scoring: input.state.settings.scoring,
      positions,
      rowsParsed,
      matched: playersById.size,
      unmatched: unmatched.slice(0, 40),
      ambiguous: ambiguous.slice(0, 40),
      approximatePositions,
      warnings: buildProjectionWarnings(input.state, approximatePositions),
      appliedAt: new Date().toISOString(),
    },
    playersById,
  };
}

export function importFantasyProsAdpCsv(input: {
  state: DraftState;
  season: string;
  csvText: string;
}): StoredAdpImport {
  const rows = parseAdpRows(input.csvText);
  const playersById = new Map<string, AdpValue>();
  const unmatched: MatchIssue[] = [];
  const ambiguous: AmbiguousMatchIssue[] = [];

  for (const row of rows) {
    if (row.sleeperAdp === null || row.position === null) {
      unmatched.push({
        row: row.rowNumber,
        name: row.name,
        team: row.team,
        position: row.position,
      });
      continue;
    }
    const match = matchPlayer(row, input.state.players);
    if (match.kind === "matched") {
      playersById.set(match.player.id, {
        sleeperAdp: row.sleeperAdp,
        realTimeAdp: row.realTimeAdp,
      });
    } else if (match.kind === "ambiguous") {
      ambiguous.push({
        row: row.rowNumber,
        name: row.name,
        team: row.team,
        position: row.position,
        candidates: match.players.map(formatPlayerCandidate),
      });
    } else {
      unmatched.push({
        row: row.rowNumber,
        name: row.name,
        team: row.team,
        position: row.position,
      });
    }
  }

  return {
    summary: {
      source: "fantasypros",
      market: "Sleeper",
      season: input.season,
      rowsParsed: rows.length,
      matched: playersById.size,
      unmatched: unmatched.slice(0, 40),
      ambiguous: ambiguous.slice(0, 40),
      includesRealTime: rows.some((row) => row.realTimeAdp !== null),
      appliedAt: new Date().toISOString(),
    },
    playersById,
  };
}

export function applySeasonProjections(state: DraftState, storedImport: StoredSeasonProjectionImport): DraftState {
  return {
    ...state,
    players: state.players.map((player) => applySeasonProjectionValue(player, storedImport)),
  };
}

export function applySeasonProjectionValue(
  player: Player,
  storedImport: StoredSeasonProjectionImport | null,
): Player {
  const value = storedImport?.playersById.get(player.id);
  if (!value) {
    return player;
  }
  return {
    ...player,
    projectedPoints: value.points,
    projectionSource: "season_projection",
    seasonProjectedPoints: value.points,
    seasonProjectionSource: "FantasyPros",
    seasonProjectionSeason: storedImport?.summary.season ?? null,
    seasonProjectionCoverage: value.coverage,
  };
}

export function applyAdp(state: DraftState, storedImport: StoredAdpImport): DraftState {
  return {
    ...state,
    players: state.players.map((player) => applyAdpValue(player, storedImport)),
  };
}

export function applyAdpValue(player: Player, storedImport: StoredAdpImport | null): Player {
  const value = storedImport?.playersById.get(player.id);
  if (!value) {
    return player;
  }
  return {
    ...player,
    adp: value.sleeperAdp,
    adpSource: "FantasyPros Sleeper ADP",
    realTimeAdp: value.realTimeAdp,
  };
}

function parseProjectionRows(csvText: string, position: Position): ProjectionRow[] {
  const [headers, ...records] = parseCsv(csvText.trim());
  if (!headers) {
    return [];
  }
  const headerIndexes = buildHeaderIndexes(headers);
  return records
    .map((record, index) => toProjectionRow(record, index + 2, position, headerIndexes))
    .filter((row): row is ProjectionRow => row !== null);
}

function toProjectionRow(
  record: string[],
  rowNumber: number,
  position: Position,
  headerIndexes: Map<string, number[]>,
): ProjectionRow | null {
  const name = cleanText(getCell(record, headerIndexes, "player"));
  if (!name) {
    return null;
  }
  const team = nullableText(getCell(record, headerIndexes, "team"));
  const providerPoints = numberFrom(getCell(record, headerIndexes, "fpts"));
  const value = (header: string, occurrence = 0) => numberFrom(getCell(record, headerIndexes, header, occurrence)) ?? 0;
  const stats: Record<string, number> = {};

  if (position === "QB") {
    Object.assign(stats, {
      pass_att: value("att", 0),
      pass_cmp: value("cmp"),
      pass_yd: value("yds", 0),
      pass_td: value("tds", 0),
      pass_int: value("ints"),
      rush_att: value("att", 1),
      rush_yd: value("yds", 1),
      rush_td: value("tds", 1),
      fum_lost: value("fl"),
    });
  } else if (position === "RB" || position === "WR") {
    Object.assign(stats, {
      rush_att: value("att"),
      rush_yd: value("yds", position === "RB" ? 0 : 1),
      rush_td: value("tds", position === "RB" ? 0 : 1),
      rec: value("rec"),
      rec_yd: value("yds", position === "RB" ? 1 : 0),
      rec_td: value("tds", position === "RB" ? 1 : 0),
      fum_lost: value("fl"),
    });
  } else if (position === "TE") {
    Object.assign(stats, {
      rec: value("rec"),
      rec_yd: value("yds"),
      rec_td: value("tds"),
      fum_lost: value("fl"),
    });
  } else if (position === "K") {
    Object.assign(stats, {
      fgm: value("fg"),
      fga: value("fga"),
      xpm: value("xpt"),
    });
  } else {
    Object.assign(stats, {
      sack: value("sack"),
      int: value("int"),
      fum_rec: value("fr"),
      ff: value("ff"),
      def_td: value("td"),
      safe: value("safety"),
      points_allowed: value("pa"),
      yards_allowed: value("ydsagn"),
    });
  }

  return { rowNumber, name, team, position, stats, providerPoints };
}

function scoreProjection(row: ProjectionRow, state: DraftState): number {
  const scoring = Object.keys(state.settings.scoringSettings ?? {}).length > 0
    ? state.settings.scoringSettings!
    : defaultScoringSettings(state.settings.scoring);
  return Object.entries(row.stats)
    .reduce((total, [stat, value]) => total + value * (scoring[stat] ?? 0), 0);
}

function defaultScoringSettings(scoringLabel: string): Record<string, number> {
  const receptionPoints = scoringLabel.toLowerCase().includes("half")
    ? 0.5
    : scoringLabel.toLowerCase() === "ppr"
      ? 1
      : 0;
  return {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -1,
    rush_yd: 0.1,
    rush_td: 6,
    rec: receptionPoints,
    rec_yd: 0.1,
    rec_td: 6,
    fum_lost: -2,
  };
}

function buildProjectionWarnings(state: DraftState, approximatePositions: Position[]): string[] {
  const warnings: string[] = [];
  if (approximatePositions.length > 0) {
    warnings.push(
      `${approximatePositions.join(" and ")} use FantasyPros provider points because their CSVs do not contain enough detail to reproduce every Sleeper scoring rule.`,
    );
  }
  const unsupportedScoringKeys = Object.entries(state.settings.scoringSettings ?? {})
    .filter(([key, value]) => value !== 0 && !supportedProjectionScoringKeys.has(key))
    .map(([key]) => key);
  if (unsupportedScoringKeys.length > 0) {
    warnings.push(
      `Projection exports do not expose every stat needed for ${unsupportedScoringKeys.slice(0, 8).join(", ")}${unsupportedScoringKeys.length > 8 ? ", and other rules" : ""}.`,
    );
  }
  return warnings;
}

const supportedProjectionScoringKeys = new Set([
  "pass_att",
  "pass_cmp",
  "pass_yd",
  "pass_td",
  "pass_int",
  "rush_att",
  "rush_yd",
  "rush_td",
  "rec",
  "rec_yd",
  "rec_td",
  "fum_lost",
]);

function parseAdpRows(csvText: string): AdpRow[] {
  const [headers, ...records] = parseCsv(csvText.trim());
  if (!headers) {
    return [];
  }
  const headerIndexes = buildHeaderIndexes(headers);
  return records
    .map((record, index) => {
      const playerText = cleanText(getCell(record, headerIndexes, "playerbye"));
      const positionText = cleanText(getCell(record, headerIndexes, "pos"));
      const player = parseAdpPlayer(playerText);
      return {
        rowNumber: index + 2,
        name: player.name,
        team: player.team,
        position: normalizePosition(positionText.replace(/\d+$/, "")),
        sleeperAdp: numberFrom(getCell(record, headerIndexes, "sleeper")),
        realTimeAdp: numberFrom(getCell(record, headerIndexes, "realtime")),
      };
    })
    .filter((row) => row.name.length > 0);
}

function parseAdpPlayer(value: string): { name: string; team: string | null } {
  const match = value.match(/^(.*?)\s+([A-Z]{2,3}|FA)\s+\([^)]*\)$/);
  return match
    ? { name: match[1]!.trim(), team: nullableText(match[2] ?? "") }
    : { name: value.trim(), team: null };
}

function matchPlayer(
  row: { name: string; team: string | null; position: Position | null },
  players: Player[],
) {
  const normalizedName = normalizeName(row.name);
  const candidates = players.filter((player) => {
    if (row.position && player.position !== row.position) {
      return false;
    }
    return normalizeName(player.name) === normalizedName;
  });
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

function buildHeaderIndexes(headers: string[]): Map<string, number[]> {
  const indexes = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    indexes.set(key, [...(indexes.get(key) ?? []), index]);
  });
  return indexes;
}

function getCell(
  record: string[],
  indexes: Map<string, number[]>,
  header: string,
  occurrence = 0,
): string {
  const index = indexes.get(header)?.[occurrence];
  return index === undefined ? "" : (record[index] ?? "").trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }
  return rows;
}

function serializeSeasonProjectionImport(
  storedImport: StoredSeasonProjectionImport,
): SerializedSeasonProjectionImport {
  return {
    summary: storedImport.summary,
    players: Array.from(storedImport.playersById.entries()),
  };
}

function deserializeSeasonProjectionImport(
  storedImport: SerializedSeasonProjectionImport,
): StoredSeasonProjectionImport {
  return {
    summary: storedImport.summary,
    playersById: new Map(storedImport.players),
  };
}

function serializeAdpImport(storedImport: StoredAdpImport): SerializedAdpImport {
  return {
    summary: storedImport.summary,
    players: Array.from(storedImport.playersById.entries()),
  };
}

function deserializeAdpImport(storedImport: SerializedAdpImport): StoredAdpImport {
  return {
    summary: storedImport.summary,
    playersById: new Map(storedImport.players),
  };
}

function normalizeHeader(header: string): string {
  return cleanText(header).toLowerCase().replace(/[^a-z0-9]/g, "");
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

function normalizePosition(value: string): Position | null {
  const normalized = value.toUpperCase() === "DST" ? "DEF" : value.toUpperCase();
  return supportedPositions.has(normalized as Position) ? (normalized as Position) : null;
}

function cleanText(value: string): string {
  return value.replace(/\u00c2/g, "").replace(/\u00a0/g, " ").trim();
}

function nullableText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned ? cleaned : null;
}

function numberFrom(value: string | undefined): number | null {
  const cleaned = cleanText(value ?? "").replace(/,/g, "").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number): number {
  return Number(value.toFixed(1));
}

function formatPlayerCandidate(player: Player): string {
  return `${player.name} (${player.team} ${player.position})`;
}

function getDefaultStorePath(fileName: string): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, fileName)
    : path.join(repoRoot, "data", fileName);
}

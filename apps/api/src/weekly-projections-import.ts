import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Player, Position, TeamManagerState, WeeklyProjectionImportSummary } from "@sleeper-ai/shared";

import type { SqliteAppDatabase } from "./sqlite-app-database";

export type WeeklyProjectionImportKey = {
  leagueId: string;
  season: string;
  week: number;
};

export type StoredWeeklyProjectionImport = {
  summary: WeeklyProjectionImportSummary;
  playersById: Map<string, ImportedWeeklyProjection>;
};

export type ImportedWeeklyProjection = {
  projectedPoints: number;
  position: Position;
  positionRank: number | null;
  stats: Record<string, number>;
};

type SerializedWeeklyProjectionImport = {
  summary: WeeklyProjectionImportSummary;
  players: Array<[string, ImportedWeeklyProjection]>;
};

type FantasyProsWeeklyRow = {
  rowNumber: number;
  name: string;
  team: string | null;
  position: Position | null;
  projectedPoints: number | null;
  positionRank: number | null;
  stats: Record<string, number>;
};

type FantasyProsWeeklyShape = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";


export class WeeklyProjectionImportStore {
  private readonly imports = new Map<string, StoredWeeklyProjectionImport>();

  constructor(private readonly filePath = getDefaultStorePath(), private readonly database?: SqliteAppDatabase) {
    this.load();
  }

  set(key: WeeklyProjectionImportKey, storedImport: StoredWeeklyProjectionImport) {
    const importKey = toImportKey(key);
    this.imports.set(importKey, storedImport);
    this.saveImport(importKey, storedImport);
  }

  get(key: WeeklyProjectionImportKey): StoredWeeklyProjectionImport | null {
    return this.imports.get(toImportKey(key)) ?? null;
  }

  delete(key: WeeklyProjectionImportKey): boolean {
    const importKey = toImportKey(key);
    const deleted = this.imports.delete(importKey);
    if (deleted) {
      if (this.database) {
        this.database.deleteJson("weekly_projection_imports", importKey);
      } else {
        this.saveFile();
      }
    }
    return deleted;
  }

  private load() {
    if (this.database) {
      const imports = this.database.listJson<SerializedWeeklyProjectionImport>("weekly_projection_imports");
      if (imports.length > 0) {
        for (const [key, storedImport] of imports) {
          this.imports.set(key, deserializeWeeklyProjectionImport(storedImport));
        }
        return;
      }
    }

    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, SerializedWeeklyProjectionImport>;
      for (const [key, storedImport] of Object.entries(parsed)) {
        const deserialized = deserializeWeeklyProjectionImport(storedImport);
        this.imports.set(key, deserialized);
        this.database?.setJson("weekly_projection_imports", key, serializeWeeklyProjectionImport(deserialized));
      }
    } catch {
      this.imports.clear();
    }
  }

  private saveImport(key: string, storedImport: StoredWeeklyProjectionImport) {
    if (this.database) {
      this.database.setJson("weekly_projection_imports", key, serializeWeeklyProjectionImport(storedImport));
      return;
    }

    this.saveFile();
  }

  private saveFile() {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const serialized = Object.fromEntries(
      Array.from(this.imports.entries()).map(([key, storedImport]) => [key, serializeWeeklyProjectionImport(storedImport)]),
    );
    writeFileSync(this.filePath, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
  }
}

export function importFantasyProsWeeklyProjectionCsv(input: {
  players: Player[];
  leagueId: string;
  season: string;
  week: number;
  csvText: string;
  position?: Position | null;
}): StoredWeeklyProjectionImport {
  const rows = parseFantasyProsWeeklyRows(input.csvText, input.position ?? null);
  const playersById = new Map<string, ImportedWeeklyProjection>();
  const unmatched: WeeklyProjectionImportSummary["unmatched"] = [];
  const ambiguous: WeeklyProjectionImportSummary["ambiguous"] = [];

  for (const row of rows) {
    if (!row.name || !row.position || row.projectedPoints === null) {
      unmatched.push({ row: row.rowNumber, name: row.name || "Unknown player", team: row.team, position: row.position });
      continue;
    }

    const match = matchPlayer(row, input.players);
    if (match.kind === "matched") {
      playersById.set(match.player.id, {
        projectedPoints: row.projectedPoints,
        position: row.position,
        positionRank: row.positionRank,
        stats: row.stats,
      });
      continue;
    }

    if (match.kind === "ambiguous") {
      ambiguous.push({
        row: row.rowNumber,
        name: row.name,
        team: row.team,
        position: row.position,
        candidates: match.players.map((player) => `${player.name} (${player.team} ${player.position})`),
      });
      continue;
    }

    unmatched.push({ row: row.rowNumber, name: row.name, team: row.team, position: row.position });
  }

  const position = rows.find((row) => row.position)?.position ?? input.position ?? null;
  return {
    summary: {
      source: "fantasypros",
      season: input.season,
      week: input.week,
      position,
      rowsParsed: rows.length,
      matched: playersById.size,
      unmatched: unmatched.slice(0, 40),
      ambiguous: ambiguous.slice(0, 40),
      appliedAt: new Date().toISOString(),
    },
    playersById,
  };
}

export function applyWeeklyProjectionsToTeamState(state: TeamManagerState, storedImport: StoredWeeklyProjectionImport | null): TeamManagerState {
  if (!storedImport) {
    return state;
  }

  const projectedState: TeamManagerState = {
    ...state,
    roster: {
      ...state.roster,
      starters: state.roster.starters.map((slot) => ({
        ...slot,
        player: slot.player ? applyWeeklyProjectionToPlayer(slot.player, storedImport) : null,
      })),
      bench: applyWeeklyProjectionsToPlayers(state.roster.bench, storedImport),
      injuredReserve: applyWeeklyProjectionsToPlayers(state.roster.injuredReserve, storedImport),
      taxi: applyWeeklyProjectionsToPlayers(state.roster.taxi, storedImport),
    },
    dataQuality: {
      ...state.dataQuality,
      playerValueSource: `FantasyPros weekly projections for ${storedImport.summary.season} Week ${storedImport.summary.week}`,
      limitations: state.dataQuality.limitations.filter((item) => !item.toLowerCase().includes("weekly projections")),
    },
  };

  return projectedState;
}

export function applyWeeklyProjectionsToPlayers(players: Player[], storedImport: StoredWeeklyProjectionImport | null): Player[] {
  return storedImport ? players.map((player) => applyWeeklyProjectionToPlayer(player, storedImport)) : players;
}

export function applyWeeklyProjectionToPlayer(player: Player, storedImport: StoredWeeklyProjectionImport): Player {
  const imported = storedImport.playersById.get(player.id);
  if (!imported) {
    return player;
  }

  return {
    ...player,
    projectedPoints: imported.projectedPoints,
    projectionSource: "weekly_projection",
    weeklyProjectedPoints: imported.projectedPoints,
    weeklyProjectionSource: "FantasyPros",
    weeklyProjectionSeason: storedImport.summary.season,
    weeklyProjectionWeek: storedImport.summary.week,
  } satisfies Player;
}

export function toImportKey(key: WeeklyProjectionImportKey): string {
  return `${key.leagueId}:${key.season}:${key.week}`;
}

function parseFantasyProsWeeklyRows(csvText: string, requestedPosition: Position | null): FantasyProsWeeklyRow[] {
  const [headers, ...records] = parseCsv(csvText.trim());
  if (!headers || headers.length === 0) {
    return [];
  }

  const shape = inferFantasyProsWeeklyShape(headers, requestedPosition);
  if (!shape) {
    return [];
  }

  return records
    .map((record, index) => toFantasyProsWeeklyRow(record, shape, index + 2))
    .filter((row) => row.name.length > 0 && row.projectedPoints !== null);
}

function inferFantasyProsWeeklyShape(headers: string[], requestedPosition: Position | null): FantasyProsWeeklyShape | null {
  if (requestedPosition) {
    return requestedPosition;
  }

  const normalized = headers.map(normalizeHeader);
  if (hasHeaders(normalized, ["sack", "int", "fr", "ff", "safety", "pa", "ydsagn"])) {
    return "DEF";
  }
  if (hasHeaders(normalized, ["fg", "fga", "xpt"])) {
    return "K";
  }
  if (normalized.slice(0, 12).join("|") === "player|team|att|cmp|yds|tds|ints|att|yds|tds|fl|fpts") {
    return "QB";
  }
  if (normalized.slice(0, 10).join("|") === "player|team|att|yds|tds|rec|yds|tds|fl|fpts") {
    return "RB";
  }
  if (normalized.slice(0, 10).join("|") === "player|team|rec|yds|tds|att|yds|tds|fl|fpts") {
    return "WR";
  }
  if (normalized.slice(0, 7).join("|") === "player|team|rec|yds|tds|fl|fpts") {
    return "TE";
  }

  return null;
}

function toFantasyProsWeeklyRow(record: string[], shape: FantasyProsWeeklyShape, rowNumber: number): FantasyProsWeeklyRow {
  const name = cleanCell(record[0]);
  const team = nullableString(cleanCell(record[1]));
  const position = shape === "DEF" ? "DEF" : shape;
  const positionRank = null;
  const stats = toStats(record, shape);
  const projectedPoints = stats.fantasyPoints ?? null;

  return {
    rowNumber,
    name,
    team,
    position,
    projectedPoints,
    positionRank,
    stats,
  };
}

function toStats(record: string[], shape: FantasyProsWeeklyShape): Record<string, number> {
  if (shape === "QB") {
    return compactStats({
      passAttempts: numberFrom(record[2]),
      completions: numberFrom(record[3]),
      passYards: numberFrom(record[4]),
      passTouchdowns: numberFrom(record[5]),
      interceptions: numberFrom(record[6]),
      rushAttempts: numberFrom(record[7]),
      rushYards: numberFrom(record[8]),
      rushTouchdowns: numberFrom(record[9]),
      fumblesLost: numberFrom(record[10]),
      fantasyPoints: numberFrom(record[11]),
    });
  }

  if (shape === "RB") {
    return compactStats({
      rushAttempts: numberFrom(record[2]),
      rushYards: numberFrom(record[3]),
      rushTouchdowns: numberFrom(record[4]),
      receptions: numberFrom(record[5]),
      receivingYards: numberFrom(record[6]),
      receivingTouchdowns: numberFrom(record[7]),
      fumblesLost: numberFrom(record[8]),
      fantasyPoints: numberFrom(record[9]),
    });
  }

  if (shape === "WR") {
    return compactStats({
      receptions: numberFrom(record[2]),
      receivingYards: numberFrom(record[3]),
      receivingTouchdowns: numberFrom(record[4]),
      rushAttempts: numberFrom(record[5]),
      rushYards: numberFrom(record[6]),
      rushTouchdowns: numberFrom(record[7]),
      fumblesLost: numberFrom(record[8]),
      fantasyPoints: numberFrom(record[9]),
    });
  }

  if (shape === "TE") {
    return compactStats({
      receptions: numberFrom(record[2]),
      receivingYards: numberFrom(record[3]),
      receivingTouchdowns: numberFrom(record[4]),
      fumblesLost: numberFrom(record[5]),
      fantasyPoints: numberFrom(record[6]),
    });
  }

  if (shape === "K") {
    return compactStats({
      fieldGoals: numberFrom(record[2]),
      fieldGoalAttempts: numberFrom(record[3]),
      extraPoints: numberFrom(record[4]),
      fantasyPoints: numberFrom(record[5]),
    });
  }

  return compactStats({
    sacks: numberFrom(record[2]),
    interceptions: numberFrom(record[3]),
    fumbleRecoveries: numberFrom(record[4]),
    forcedFumbles: numberFrom(record[5]),
    touchdowns: numberFrom(record[6]),
    safeties: numberFrom(record[7]),
    pointsAllowed: numberFrom(record[8]),
    yardsAllowed: numberFrom(record[9]),
    fantasyPoints: numberFrom(record[10]),
  });
}

function matchPlayer(row: FantasyProsWeeklyRow, players: Player[]) {
  const normalizedName = normalizeName(row.name);
  const candidates = players.filter((player) => {
    if (row.position && player.position !== row.position) {
      return false;
    }

    return normalizeName(player.name) === normalizedName;
  });

  const teamMatches = row.team
    ? candidates.filter((player) => normalizeTeam(player.team) === normalizeTeam(row.team ?? ""))
    : [];

  const matches = teamMatches.length > 0 ? teamMatches : candidates;
  if (matches.length === 1) {
    return { kind: "matched" as const, player: matches[0] };
  }

  if (matches.length > 1) {
    return { kind: "ambiguous" as const, players: matches };
  }

  return { kind: "unmatched" as const };
}

function serializeWeeklyProjectionImport(storedImport: StoredWeeklyProjectionImport): SerializedWeeklyProjectionImport {
  return {
    summary: storedImport.summary,
    players: Array.from(storedImport.playersById.entries()),
  };
}

function deserializeWeeklyProjectionImport(storedImport: SerializedWeeklyProjectionImport): StoredWeeklyProjectionImport {
  return {
    summary: storedImport.summary,
    playersById: new Map(storedImport.players),
  };
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
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function compactStats(stats: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(Object.entries(stats).filter((entry): entry is [string, number] => entry[1] !== null));
}

function hasHeaders(headers: string[], required: string[]): boolean {
  return required.every((header) => headers.includes(header));
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanCell(value: string | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\u00c2/g, " ").trim();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v|dst|def|defense)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTeam(team: string): string {
  return team.toUpperCase() === "JAC" ? "JAX" : team.toUpperCase();
}

function numberFrom(value: string | undefined): number | null {
  const cleaned = cleanCell(value);
  if (!cleaned || cleaned === "-") {
    return null;
  }

  const parsed = Number(cleaned.replace(/^\+/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "-" ? trimmed : null;
}

function getDefaultStorePath(): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "weekly-projection-imports.json")
    : path.join(repoRoot, "data", "weekly-projection-imports.json");
}

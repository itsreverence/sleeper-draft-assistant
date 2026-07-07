import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DraftState, Player, Position, RankingImportSummary } from "@sleeper-ai/shared";

export type StoredRankingImport = {
  summary: RankingImportSummary;
  playersById: Map<string, ImportedPlayerValues>;
};

type ImportedPlayerValues = {
  rank: number;
  tier: number | null;
  positionRank: number | null;
  byeWeek: number | null;
  ecrVsAdp: number | null;
  sosSeasonStars: number | null;
};

type SerializedRankingImport = {
  summary: RankingImportSummary;
  players: Array<[string, ImportedPlayerValues]>;
};

type FantasyProsRow = {
  rowNumber: number;
  rank: number | null;
  tier: number | null;
  name: string;
  team: string | null;
  position: Position | null;
  positionRank: number | null;
  byeWeek: number | null;
  ecrVsAdp: number | null;
  sosSeasonStars: number | null;
};

const supportedPositions = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DEF"]);

const positionBaselines: Record<Position, number> = {
  QB: 250,
  RB: 180,
  WR: 175,
  TE: 135,
  K: 105,
  DEF: 110,
};

export class RankingImportStore {
  private readonly imports = new Map<string, StoredRankingImport>();

  constructor(private readonly filePath = getDefaultStorePath()) {
    this.load();
  }

  set(draftId: string, storedImport: StoredRankingImport) {
    this.imports.set(draftId, storedImport);
    this.save();
  }

  get(draftId: string): StoredRankingImport | null {
    return this.imports.get(draftId) ?? null;
  }

  delete(draftId: string): boolean {
    const deleted = this.imports.delete(draftId);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  apply(draftId: string, state: DraftState): DraftState {
    const storedImport = this.get(draftId);
    return storedImport ? applyImportedRankings(state, storedImport) : state;
  }

  private load() {
    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, SerializedRankingImport>;
      for (const [draftId, storedImport] of Object.entries(parsed)) {
        this.imports.set(draftId, {
          summary: storedImport.summary,
          playersById: new Map(storedImport.players),
        });
      }
    } catch {
      this.imports.clear();
    }
  }

  private save() {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const serialized = Object.fromEntries(
      Array.from(this.imports.entries()).map(([draftId, storedImport]) => [
        draftId,
        {
          summary: storedImport.summary,
          players: Array.from(storedImport.playersById.entries()),
        } satisfies SerializedRankingImport,
      ]),
    );
    writeFileSync(this.filePath, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
  }
}

export function importFantasyProsCsv(state: DraftState, csvText: string): StoredRankingImport {
  const rows = parseFantasyProsRows(csvText);
  const playersById = new Map<string, ImportedPlayerValues>();
  const unmatched: RankingImportSummary["unmatched"] = [];
  const ambiguous: RankingImportSummary["ambiguous"] = [];

  for (const row of rows) {
    if (!row.rank || !row.name || !row.position) {
      unmatched.push({ row: row.rowNumber, name: row.name || "Unknown player", team: row.team, position: row.position });
      continue;
    }

    const match = matchPlayer(row, state.players);
    if (match.kind === "matched") {
      playersById.set(match.player.id, {
        rank: row.rank,
        tier: row.tier,
        positionRank: row.positionRank,
        byeWeek: row.byeWeek,
        ecrVsAdp: row.ecrVsAdp,
        sosSeasonStars: row.sosSeasonStars,
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

  return {
    summary: {
      source: "fantasypros",
      rowsParsed: rows.length,
      matched: playersById.size,
      unmatched: unmatched.slice(0, 40),
      ambiguous: ambiguous.slice(0, 40),
      appliedAt: new Date().toISOString(),
    },
    playersById,
  };
}

export function applyImportedRankings(state: DraftState, storedImport: StoredRankingImport): DraftState {
  return {
    ...state,
    players: state.players.map((player) => {
      const imported = storedImport.playersById.get(player.id);
      if (!imported) {
        return player;
      }

      return {
        ...player,
        projectedPoints: estimateProjectedPointsFromRank(player.position, imported.rank),
        projectionSource: "imported",
        adp: player.adp,
        tier: imported.tier,
        importedRank: imported.rank,
        importedPositionRank: imported.positionRank,
        importedSource: "FantasyPros",
        byeWeek: imported.byeWeek,
        ecrVsAdp: imported.ecrVsAdp,
        riskTags: mergeRiskTags(player.riskTags, imported),
      } satisfies Player;
    }),
  };
}

function parseFantasyProsRows(csvText: string): FantasyProsRow[] {
  const [headers, ...records] = parseCsv(csvText.trim());
  if (!headers || headers.length === 0) {
    return [];
  }

  const headerMap = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  return records
    .map((record, index) => toFantasyProsRow(record, headerMap, index + 2))
    .filter((row) => row.name.length > 0);
}

function toFantasyProsRow(record: string[], headerMap: Map<string, number>, rowNumber: number): FantasyProsRow {
  const rawPosition = getCell(record, headerMap, "pos");
  const positionMatch = rawPosition.match(/^([A-Z]+)(\d+)?$/i);
  const rawPositionName = positionMatch?.[1]?.toUpperCase() ?? null;
  const position = normalizePosition(rawPositionName);

  return {
    rowNumber,
    rank: numberFrom(getCell(record, headerMap, "rk")),
    tier: numberFrom(getCell(record, headerMap, "tiers")),
    name: getCell(record, headerMap, "playername"),
    team: nullableString(getCell(record, headerMap, "team")),
    position,
    positionRank: numberFrom(positionMatch?.[2] ?? ""),
    byeWeek: numberFrom(getCell(record, headerMap, "byeweek")),
    ecrVsAdp: numberFrom(getCell(record, headerMap, "ecrvsadp")),
    sosSeasonStars: parseStars(getCell(record, headerMap, "sosseason")),
  };
}

function matchPlayer(row: FantasyProsRow, players: Player[]) {
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

function getDefaultStorePath(): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "ranking-imports.json")
    : path.join(repoRoot, "data", "ranking-imports.json");
}

function getCell(record: string[], headerMap: Map<string, number>, key: string): string {
  const index = headerMap.get(key);
  return index === undefined ? "" : (record[index] ?? "").trim();
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTeam(team: string): string {
  return team.toUpperCase() === "JAC" ? "JAX" : team.toUpperCase();
}

function normalizePosition(rawPosition: string | null): Position | null {
  const normalized = rawPosition === "DST" ? "DEF" : rawPosition;
  return normalized && supportedPositions.has(normalized as Position) ? (normalized as Position) : null;
}

function estimateProjectedPointsFromRank(position: Position, rank: number): number {
  const rankBoost = Math.max(0, 76 - rank * 0.16);
  const positionalWeight = position === "QB" ? 0.9 : position === "TE" ? 0.82 : position === "K" || position === "DEF" ? 0.35 : 1;
  return Number((positionBaselines[position] + rankBoost * positionalWeight).toFixed(1));
}

function mergeRiskTags(existing: string[], imported: ImportedPlayerValues): string[] {
  const tags = new Set(existing);
  if (imported.ecrVsAdp !== null && imported.ecrVsAdp <= -20) {
    tags.add("expensive vs ADP");
  }
  if (imported.sosSeasonStars !== null && imported.sosSeasonStars <= 2) {
    tags.add("tough season SOS");
  }
  return Array.from(tags);
}

function parseStars(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s+out of\s+5/i);
  return match ? numberFrom(match[1]) : null;
}

function numberFrom(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") {
    return null;
  }

  const parsed = Number(trimmed.replace(/^\+/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "-" ? trimmed : null;
}

import type { Position } from "./types";

export interface FantasyProsProjectionFile {
  name: string;
  csv: string;
}

export function inferFantasyProsProjectionPosition({ name, csv }: FantasyProsProjectionFile): Position | null {
  const positions = new Set<Position>();
  for (const match of name.matchAll(/(?:^|[_\s-])(QB|RB|WR|TE|K|DST|DEF)(?=[_.\s(-]|$)/gi)) {
    const token = match[1]?.toUpperCase();
    switch (token) {
      case "QB":
      case "RB":
      case "WR":
      case "TE":
      case "K":
        positions.add(token);
        break;
      case "DST":
      case "DEF":
        positions.add("DEF");
        break;
    }
  }
  if (positions.size === 1) return positions.values().next().value ?? null;

  const headers = parseHeader(csv);
  if (headers.includes("CMP") && headers.includes("INTS")) return "QB";
  if (headers.includes("SACK") && headers.includes("YDS_AGN")) return "DEF";
  if (headers.includes("FG") && headers.includes("FGA")) return "K";
  return null;
}

function parseHeader(csv: string): string[] {
  const headers: string[] = [];
  const text = csv.trimStart();
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === ",") {
      headers.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      break;
    } else {
      cell += character;
    }
  }
  headers.push(cell);
  return headers.map((header) => header.trim().toUpperCase());
}

import type { DraftScoringFormat, Position } from "@sleeper-draft-assistant/shared";

const receptionPositions = new Set<Position>(["RB", "WR", "TE"]);

const fantasyProsScoring: Partial<Record<DraftScoringFormat, string>> = {
  PPR: "PPR",
  "Half PPR": "HALF",
  Standard: "STD",
};

export function buildFantasyProsWeeklyProjectionUrl(input: {
  position: Position;
  week: number;
  scoring: DraftScoringFormat;
}): string {
  const position = input.position === "DEF" ? "dst" : input.position.toLowerCase();
  const params = new URLSearchParams();

  if (input.week > 0) {
    params.set("week", String(input.week));
  }

  const scoring = fantasyProsScoring[input.scoring];
  if (receptionPositions.has(input.position) && scoring) {
    params.set("scoring", scoring);
  }

  const query = params.toString();
  return `https://www.fantasypros.com/nfl/projections/${position}.php${query ? `?${query}` : ""}`;
}

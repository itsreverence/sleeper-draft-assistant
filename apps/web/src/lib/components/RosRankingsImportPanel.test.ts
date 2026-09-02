import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import type { SeasonValueRankingImportSummary } from "../types";
import RosRankingsImportPanel from "./RosRankingsImportPanel.svelte";

const fallbackSummary: SeasonValueRankingImportSummary = {
  source: "fantasypros",
  rankingType: "draft-ecr-fallback",
  rankingOrigin: "draft-import",
  season: "2026",
  scoring: "PPR",
  rowsParsed: 200,
  matched: 198,
  unmatched: [],
  ambiguous: [],
  appliedAt: "2026-08-20T00:00:00.000Z",
};

describe("season value ranking controls", () => {
  it("labels connected draft ECR without an early replacement warning", () => {
    renderPanel("preseason", 0);

    expect(screen.getByText(/Draft ECR fallback · 198 matched/)).toBeTruthy();
    expect(screen.getByText(/Reused from the connected draft/)).toBeTruthy();
    expect(screen.queryByText(/ROS update recommended/)).toBeNull();
  });

  it("recommends replacing draft fallback beginning in Week 2", () => {
    renderPanel("regular", 2);

    expect(screen.getByText("ROS update recommended. Draft ECR fallback is still active.")).toBeTruthy();
  });

  it("gives every import action a keyboard-focusable named control", () => {
    renderPanel("regular", 1);

    const controls = [
      screen.getByRole("button", { name: "Open ROS ECR" }),
      screen.getByRole("button", { name: "Open Draft ECR" }),
      screen.getByLabelText("Choose CSV"),
      screen.getByRole("button", { name: "Replace season value rankings" }),
    ];
    for (const control of controls) {
      expect((control as HTMLElement).tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

function renderPanel(seasonPhase: "preseason" | "regular", currentWeek: number) {
  return render(RosRankingsImportPanel, {
    hasTeam: true,
    defaultSeason: "2026",
    leagueSeason: "2026",
    seasonPhase,
    currentWeek,
    scoring: "PPR",
    summary: fallbackSummary,
    weeklyLoaded: true,
    error: "",
    isImporting: false,
    isClearing: false,
    onImport: () => undefined,
    onClear: () => undefined,
    onOpenFantasyPros: () => undefined,
    onOpenDraftFallback: () => undefined,
  });
}

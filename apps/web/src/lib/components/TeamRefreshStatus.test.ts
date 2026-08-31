import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TeamRefreshStatus from "./TeamRefreshStatus.svelte";

describe("Team refresh status", () => {
  it("explains that a failed refresh preserves the last checked data", async () => {
    const onRefresh = vi.fn();
    const checkedAt = new Date("2026-08-29T12:00:00.000Z").getTime();

    render(TeamRefreshStatus, {
      lastCheckedAt: checkedAt,
      lastChangedAt: checkedAt,
      error: "Sleeper unavailable",
      onRefresh,
    });

    expect(screen.getByText(/Refresh failed\. Showing data checked/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Refresh team data" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

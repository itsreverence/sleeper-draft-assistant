<script lang="ts">
  import type {
    RosRankingImportSummary,
    TeamDataReadiness,
    TeamManagerState,
    TeamWeekContext,
    WeeklyProjectionImportSummary,
  } from "../types";
  import Icon from "./Icon.svelte";

  let {
    state,
    readiness,
    weekContext,
    rosSummary,
    weeklySummary,
    isLoading = false,
    onManageData,
  }: {
    state: TeamManagerState | null;
    readiness: TeamDataReadiness | null;
    weekContext: TeamWeekContext | null;
    rosSummary: RosRankingImportSummary | null;
    weeklySummary: WeeklyProjectionImportSummary | null;
    isLoading?: boolean;
    onManageData: () => void;
  } = $props();

  const sourceCount = $derived(Number(Boolean(rosSummary)) + Number(Boolean(weeklySummary)));
  const rosterCoverage = $derived(Math.round((readiness?.rosterProjectionCoverage ?? 0) * 100));
  const phaseValue = $derived(
    state?.seasonPhase === "preseason"
      ? "Preseason"
      : state?.seasonPhase === "postseason"
        ? "Postseason"
        : state?.week
          ? `Week ${state.week}`
          : "Season",
  );
  const phaseDetail = $derived(
    state?.seasonPhase === "preseason"
      ? "Roster planning"
      : readiness
        ? `${readiness.confidence} confidence · ${rosterCoverage}% covered`
        : "Checking decision data",
  );
  const matchupValue = $derived(
    state?.seasonPhase === "preseason"
      ? "Starts Week 1"
      : weekContext?.opponentTeamName
        ? `vs ${weekContext.opponentTeamName}`
        : "Not assigned",
  );
  const matchupDetail = $derived(
    state?.seasonPhase === "preseason"
      ? "No matchup decisions yet"
      : weekContext?.status === "in_progress"
        ? "In progress"
        : weekContext?.status === "final"
          ? "Final"
          : "Scheduled",
  );
</script>

<section class="team-status" aria-label="Team Manager status">
  <div class="status-item">
    <span>Advice</span>
    <strong>{isLoading ? "Loading" : phaseValue}</strong>
    <small>{phaseDetail}</small>
  </div>
  <div class="status-item">
    <span>Matchup</span>
    <strong>{matchupValue}</strong>
    <small>{matchupDetail}</small>
  </div>
  <div class="status-item">
    <span>Team data</span>
    <strong>{sourceCount}/2 sources</strong>
    <small>{rosSummary ? "ROS ready" : "ROS missing"} · {weeklySummary ? "Weekly ready" : "Weekly missing"}</small>
  </div>
  <button class="manage-button" type="button" onclick={onManageData}>
    <Icon name="database" size={16} />
    <span>Manage data</span>
    <Icon name="chevron-right" size={14} />
  </button>
</section>

<style>
  .team-status {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    margin-top: var(--space-5);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
  }

  .status-item {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 12px 16px;
  }

  .status-item + .status-item,
  .manage-button {
    border-left: 1px solid var(--border);
  }

  .status-item span {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .status-item strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-item small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manage-button {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    min-width: 154px;
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    border-radius: 0;
    background: transparent;
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 850;
    cursor: pointer;
  }

  .manage-button:hover {
    background: var(--surface-sunken);
  }

  @media (max-width: 840px) {
    .team-status {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .status-item:nth-child(3),
    .manage-button {
      border-top: 1px solid var(--border);
    }

    .status-item:nth-child(3) {
      border-left: 0;
    }
  }

  @media (max-width: 560px) {
    .team-status {
      grid-template-columns: 1fr;
    }

    .status-item + .status-item,
    .status-item:nth-child(3),
    .manage-button {
      border-top: 1px solid var(--border);
      border-left: 0;
    }

    .manage-button {
      min-height: 48px;
    }
  }
</style>

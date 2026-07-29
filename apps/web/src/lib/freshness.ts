export type ImportFreshness = {
  ageDays: number;
  label: string;
  stale: boolean;
};

export function getImportFreshness(
  appliedAt: string,
  staleAfterDays: number,
  now = Date.now(),
): ImportFreshness {
  const applied = new Date(appliedAt).getTime();
  if (!Number.isFinite(applied)) {
    return { ageDays: 0, label: "date unknown", stale: true };
  }

  const ageDays = Math.max(0, Math.floor((now - applied) / 86_400_000));
  const label = ageDays === 0 ? "updated today" : ageDays === 1 ? "1 day old" : `${ageDays} days old`;
  return {
    ageDays,
    label,
    stale: ageDays >= staleAfterDays,
  };
}


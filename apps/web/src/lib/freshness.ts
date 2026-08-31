export type ImportFreshness = {
  ageDays: number;
  label: string;
  stale: boolean;
};

export function getOldestImportAppliedAt(appliedAtValues: string[], fallback: string): string {
  if (appliedAtValues.length === 0) {
    return fallback;
  }

  let oldest = appliedAtValues[0]!;
  let oldestTime = Date.parse(oldest);
  if (!Number.isFinite(oldestTime)) {
    return oldest;
  }

  for (const appliedAt of appliedAtValues.slice(1)) {
    const appliedAtTime = Date.parse(appliedAt);
    if (!Number.isFinite(appliedAtTime)) {
      return appliedAt;
    }
    if (appliedAtTime < oldestTime) {
      oldest = appliedAt;
      oldestTime = appliedAtTime;
    }
  }

  return oldest;
}

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

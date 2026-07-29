import type { FormatCompatibility } from "@sleeper-draft-assistant/shared";

const supportedRosterSlots = new Set([
  "QB", "RB", "WR", "TE", "K", "DEF",
  "FLEX", "WR_RB_FLEX", "REC_FLEX", "SUPER_FLEX", "SF",
  "BN", "IR", "TAXI",
]);
const idpRosterSlots = new Set(["DL", "DE", "DT", "LB", "DB", "CB", "S", "IDP", "IDP_FLEX"]);

export function assessFormatCompatibility(input: {
  scoring: string;
  scoringSettings?: Record<string, number>;
  rosterSlots: Record<string, number>;
  draftType?: string | null;
}): FormatCompatibility {
  const features: FormatCompatibility["features"] = [];
  const warnings: string[] = [];
  const activeSlots = Object.entries(input.rosterSlots)
    .filter(([, count]) => count > 0)
    .map(([slot]) => slot.toUpperCase());
  const draftType = input.draftType?.trim().toLowerCase() ?? "";
  const hasIdp = activeSlots.some((slot) => idpRosterSlots.has(slot));
  const unknownSlots = activeSlots.filter((slot) => !supportedRosterSlots.has(slot) && !idpRosterSlots.has(slot));
  const hasSuperflex = activeSlots.some((slot) => slot === "SUPER_FLEX" || slot === "SF");
  const hasTePremium = isTePremium(input.scoringSettings);
  const hasCustomScoring = input.scoring.trim().toLowerCase() === "custom";
  const hasAuction = draftType === "auction";

  if (hasSuperflex) {
    features.push("superflex");
  }
  if (hasTePremium) {
    features.push("te_premium");
    warnings.push("TE-premium roster demand is recognized, but imported ECR, ROS ranks, and weekly FPTS must come from a matching TE-premium source.");
  }
  if (hasCustomScoring) {
    features.push("custom_scoring");
    warnings.push("Custom Sleeper scoring is only partially modeled; imported ranks and provider-scored weekly points may not reflect every rule.");
  }
  if (hasIdp) {
    features.push("idp");
    warnings.push("IDP positions are not supported and are excluded from player values, lineup optimization, and recommendations.");
  }
  if (hasAuction) {
    features.push("auction");
    warnings.push("Auction and salary values are not supported; recommendations do not account for budgets or nomination strategy.");
  }
  if (unknownSlots.length > 0) {
    warnings.push(`Unrecognized roster slots are not modeled: ${unknownSlots.join(", ")}.`);
  }

  return {
    level: hasIdp || hasAuction
      ? "unsupported"
      : warnings.length > 0
        ? "caution"
        : "supported",
    features,
    warnings,
  };
}

function isTePremium(scoringSettings: Record<string, number> | undefined): boolean {
  return Object.entries(scoringSettings ?? {}).some(([key, value]) =>
    value !== 0 && ["bonus_rec_te", "rec_te"].includes(key.toLowerCase()),
  );
}

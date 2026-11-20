export type EligibilityMode = "all" | "checked_in_only" | "manual_eligible" | "hybrid";

export type ParticipantEligibility = {
  id: number;
  status: string;
  checked_in: number;
  eligible_override: number | null;
};

export function isParticipantEligible(
  p: ParticipantEligibility,
  mode: EligibilityMode
): boolean {
  if (p.status !== "active") return false;
  if (p.eligible_override === 0) return false;

  switch (mode) {
    case "all":
      return true;
    case "checked_in_only":
      return p.checked_in === 1;
    case "manual_eligible":
      return p.eligible_override === 1;
    case "hybrid":
      return p.checked_in === 1 && (p.eligible_override === null || p.eligible_override === 1);
    default:
      return false;
  }
}

export function buildPoolPolicy(
  mode: EligibilityMode,
  totalActive: number,
  eligibleCount: number
): Record<string, unknown> {
  return {
    eligibilityMode: mode,
    poolRefreshPolicy: "on_round_start",
    participantCountTotal: totalActive,
    participantCountEligible: eligibleCount,
    computedAt: new Date().toISOString(),
  };
}

export const ELIGIBILITY_LABELS: Record<EligibilityMode, string> = {
  all: "全员参与（不做签到）",
  checked_in_only: "仅已签到",
  manual_eligible: "手动勾选「可参与」",
  hybrid: "签到且可参与",
};
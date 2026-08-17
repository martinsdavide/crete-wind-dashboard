import { RegionConfig } from "@/types/region";
import { DailyWindSummary } from "@/types/weather";

/**
 * Generates human-readable recommendation explanations driven entirely by RegionConfig explanation rules.
 */
export function generateRecommendationExplanation(
  regionConfig: RegionConfig,
  bestSpotId: string | null,
  regimeId: string,
  summaries: Record<string, DailyWindSummary | null | undefined>,
  currentReasonCodes?: import("@/types/weather").DiagnosticReasonCode[]
): string[] {
  if (!bestSpotId) {
    const allWinds = Object.values(summaries).map((s) => s?.maxWind ?? 0);
    const maxAcrossSpots = Math.max(0, ...allWinds);

    if (maxAcrossSpots < 11) {
      return ["Light or insufficient wind across all spots today for windsurfing."];
    }
    return ["No spot currently offers suitable windsurfing conditions."];
  }

  const explanations: string[] = [];
  const bestSummary = summaries[bestSpotId];
  const bestScore = bestSummary?.score ?? 0;
  const bestWind = bestSummary?.daytimeMaxWind ?? bestSummary?.maxWind ?? 0;
  const activeCodes = currentReasonCodes || bestSummary?.reasonCodes || [];

  // 1. Evaluate region rules matching the conditions
  for (const rule of regionConfig.explanationRules) {
    const matchSpot = !rule.condition.spotId || rule.condition.spotId === bestSpotId;
    const matchRegime = !rule.condition.regimeId || rule.condition.regimeId === regimeId;
    const matchMinScore = rule.condition.minScore === undefined || bestScore >= rule.condition.minScore;
    const matchMinWind = rule.condition.minWind === undefined || bestWind >= rule.condition.minWind;

    const matchReasonCodesAny =
      !rule.condition.reasonCodesAny ||
      rule.condition.reasonCodesAny.some((code) => activeCodes.includes(code));
    const matchReasonCodesAll =
      !rule.condition.reasonCodesAll ||
      rule.condition.reasonCodesAll.every((code) => activeCodes.includes(code));

    if (
      matchSpot &&
      matchRegime &&
      matchMinScore &&
      matchMinWind &&
      matchReasonCodesAny &&
      matchReasonCodesAll
    ) {
      explanations.push(rule.explanation);
    }
  }

  // If no rule matched, provide fallback
  if (explanations.length === 0) {
    const spotObj = regionConfig.spots.find((s) => s.id === bestSpotId);
    const spotName = spotObj?.name || bestSpotId;
    explanations.push(
      `${spotName} is delivering the highest session quality score today under ${regimeId} flow.`
    );
  }

  // 2. Append Window Stability insight if available
  if (bestSummary?.bestWindow?.stability) {
    const stab = bestSummary.bestWindow.stability;
    if (
      stab.confidence === "HIGH" ||
      stab.windStabilityLabel === "Very Stable" ||
      stab.windStabilityLabel === "Stable"
    ) {
      explanations.push(
        `The wind remains ${stab.windStabilityLabel.toLowerCase()} throughout the session (${Math.round(
          stab.minWind
        )}–${Math.round(stab.maxWind)} kt) with ${
          stab.directionRange <= 15 ? "steady" : "shifting"
        } direction (${stab.directionRangeLabel}) and ${stab.gustinessLabel.toLowerCase()} airflow.`
      );
    }
  }

  return explanations;
}

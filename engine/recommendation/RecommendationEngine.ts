import { RegionConfig } from "@/types/region";
import {
  Recommendation,
  SpotForecast,
  SpotResult,
  WindDirection,
  WindRegime,
} from "@/types/weather";
import { generateRecommendationExplanation } from "../explanation/ExplanationEngine";
import { degreesToCompass } from "@/lib/windDirection";

/**
 * Classifies regional wind regime based on configured RegionConfig regime rules.
 */
export function classifyRegionalRegime(
  regionConfig: RegionConfig,
  spotForecasts: Record<string, SpotForecast | null | undefined>
): { regimeId: string; regimeLabel: string } {
  const defaultRegime = regionConfig.regimes[0] || {
    id: "MODERATE_FLOW",
    label: "Moderate Flow",
  };

  // Find reference flow from configured reference spots
  const referenceForecasts: SpotForecast[] = [];
  for (const spot of regionConfig.spots) {
    const fc = spotForecasts[spot.id];
    if (fc) referenceForecasts.push(fc);
  }

  if (referenceForecasts.length === 0) {
    return { regimeId: defaultRegime.id, regimeLabel: defaultRegime.label };
  }

  // Calculate average raw speed and dominant raw direction across reference spots
  const rawWinds: number[] = [];
  const rawDirs: number[] = [];

  for (const fc of referenceForecasts) {
    if (fc.current) {
      rawWinds.push(fc.current.modelWind);
      rawDirs.push(fc.current.directionDegrees);
    }
  }

  const meanRawWind =
    rawWinds.length > 0
      ? rawWinds.reduce((a, b) => a + b, 0) / rawWinds.length
      : 15;

  let sinSum = 0;
  let cosSum = 0;
  for (const d of rawDirs) {
    const rad = (d * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const meanDirDeg = (Math.atan2(sinSum, cosSum) * (180 / Math.PI) + 360) % 360;
  const meanDirectionLabel = degreesToCompass(meanDirDeg);

  // Match against region's regime definitions
  for (const regime of regionConfig.regimes) {
    const dirMatch =
      !regime.criteria.directions ||
      regime.criteria.directions.length === 0 ||
      regime.criteria.directions.includes(meanDirectionLabel);

    const minMatch =
      regime.criteria.minRawWind === undefined ||
      meanRawWind >= regime.criteria.minRawWind;

    const maxMatch =
      regime.criteria.maxRawWind === undefined ||
      meanRawWind <= regime.criteria.maxRawWind;

    if (dirMatch && minMatch && maxMatch) {
      return { regimeId: regime.id, regimeLabel: regime.label };
    }
  }

  return { regimeId: defaultRegime.id, regimeLabel: defaultRegime.label };
}

export class RecommendationEngine {
  /**
   * Evaluates any RegionConfig with given spot forecasts to produce the final Recommendation.
   */
  public static run(
    regionConfig: RegionConfig,
    spotsResults: Record<string, SpotResult>
  ): Recommendation {
    // 1. Extract valid forecasts
    const validForecasts: Record<string, SpotForecast> = {};
    for (const [id, res] of Object.entries(spotsResults)) {
      if (res.status === "ok") {
        validForecasts[id] = res.data;
      }
    }

    // 2. Classify regional regime
    const { regimeId, regimeLabel } = classifyRegionalRegime(
      regionConfig,
      validForecasts
    );

    // 3. Extract today summaries
    const summaries: Record<string, any> = {};
    for (const spot of regionConfig.spots) {
      summaries[spot.id] = validForecasts[spot.id]?.days[0] ?? null;
    }

    // 4. Rank spot candidates by session score & eligibility
    interface SpotCandidate {
      id: string;
      name: string;
      score: number;
      bestWindow: any;
      eligibility: string;
      style: any;
    }

    const candidates: SpotCandidate[] = [];

    for (const spot of regionConfig.spots) {
      const summary = summaries[spot.id];
      if (!summary) continue;

      candidates.push({
        id: spot.id,
        name: spot.name,
        score: summary.score ?? 0,
        bestWindow: summary.bestWindow ?? null,
        eligibility: summary.dominantEligibility ?? "SUITABLE",
        style: summary.dominantStyle ?? spot.defaultStyle,
      });
    }

    // Filter eligible candidates: score >= 60, not UNSUITABLE
    const qualifyingCandidates = candidates.filter(
      (c) => c.score >= 60 && c.eligibility !== "UNSUITABLE"
    );

    let winner: SpotCandidate | null = null;

    if (qualifyingCandidates.length > 0) {
      // Sort by highest score, then window duration
      qualifyingCandidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const durA = a.bestWindow?.durationHours ?? 0;
        const durB = b.bestWindow?.durationHours ?? 0;
        return durB - durA;
      });
      winner = qualifyingCandidates[0];
    }

    // 5. Generate rule-based explanations
    const explanations = generateRecommendationExplanation(
      regionConfig,
      winner ? winner.id : null,
      regimeId,
      summaries
    );

    return {
      bestSpot: winner ? (winner.id as any) : null,
      bestSpotName: winner ? winner.name : null,
      bestWindow: winner ? winner.bestWindow : null,
      score: winner ? winner.score : 0,
      dayScoreKouremenos: summaries["kouremenos"]?.score ?? null,
      dayScoreTenda: summaries["tenda"]?.score ?? null,
      dayScoreXerokampos: summaries["xerokampos"]?.score ?? null,
      regime: regimeId as WindRegime,
      regimeLabel,
      sailingStyle: winner ? winner.style : "BUMP_AND_JUMP",
      explanation: explanations,
    };
  }
}

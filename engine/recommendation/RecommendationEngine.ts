import { RegionConfig } from "@/types/region";
import {
  BestWindow,
  DailyWindSummary,
  Recommendation,
  SpotForecast,
  SpotResult,
  WaterState,
  WindDirection,
  WindRegime,
} from "@/types/weather";
import { generateRecommendationExplanation } from "../explanation/ExplanationEngine";
import { degreesToCompass } from "@/lib/windDirection";
import { SCORING_CONFIG } from "@/config/windProfiles";

/**
 * Classifies regional wind regime based on configured RegionConfig regime rules.
 */
export function classifyRegionalRegime(
  regionConfig: RegionConfig,
  spotForecasts: Record<string, SpotForecast | null | undefined>
): { regimeId: string; regimeLabel: string } {
  const fallbackRegime = {
    regimeId: "OTHER_FLOW",
    regimeLabel: "Variable Airflow",
  };

  // Find reference flow from configured reference spots
  const referenceForecasts: SpotForecast[] = [];
  for (const spot of regionConfig.spots) {
    const fc = spotForecasts[spot.id];
    if (fc) referenceForecasts.push(fc);
  }

  if (referenceForecasts.length === 0) {
    return fallbackRegime;
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

  return fallbackRegime;
}

export class RecommendationEngine {
  /**
   * Evaluates any RegionConfig with given spot forecasts to produce the final Recommendation.
   */
  public static run(
    regionConfig: RegionConfig,
    spotsResults: Record<string, SpotResult>,
    referenceDate: Date = new Date()
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

    // 3. Resolve today's date in the region's configured timezone (e.g. "YYYY-MM-DD")
    let todayDateStr = "";
    try {
      todayDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: regionConfig.timezone || "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(referenceDate);
    } catch {
      todayDateStr = referenceDate.toISOString().split("T")[0];
    }

    // 4. Extract today summaries explicitly using regional local date & evaluate hard gates
    const summaries: Record<string, DailyWindSummary | null> = {};
    const spotScores: Record<string, number | null> = {};

    for (const spot of regionConfig.spots) {
      const forecast = validForecasts[spot.id];
      if (forecast && forecast.days && forecast.days.length > 0) {
        const todaySummary =
          forecast.days.find((d) => d.date === todayDateStr) || forecast.days[0];

        // Check if any hard gate excludes this spot under the classified regional regime
        const isHardGated = spot.hardGates?.some((gate) => {
          const matchesRegime = !gate.regimes || (regimeId && gate.regimes.includes(regimeId));
          const dominantDir = todaySummary.dominantDirectionDegrees;
          let matchesDir = true;
          if (gate.directionRange) {
            const [minD, maxD] = gate.directionRange;
            if (minD <= maxD) {
              matchesDir = dominantDir >= minD && dominantDir <= maxD;
            } else {
              matchesDir = dominantDir >= minD || dominantDir <= maxD;
            }
          }
          return matchesRegime && matchesDir && gate.eligibility === "UNSUITABLE";
        });

        if (isHardGated) {
          summaries[spot.id] = {
            ...todaySummary,
            score: 0,
            dominantEligibility: "UNSUITABLE",
            bestWindow: null,
          };
          spotScores[spot.id] = 0;
        } else {
          summaries[spot.id] = todaySummary;
          spotScores[spot.id] = todaySummary.score ?? null;
        }
      } else {
        summaries[spot.id] = null;
        spotScores[spot.id] = null;
      }
    }

    // 5. Rank spot candidates based on session quality and Best Window availability
    interface SpotCandidate {
      id: string;
      name: string;
      score: number;
      bestWindow: BestWindow | null;
      hasEligibleSession: boolean;
      style: WaterState;
    }

    const candidates: SpotCandidate[] = [];
    const minWindowHours = SCORING_CONFIG.bestWindow?.minConsecutiveHours || 2;

    for (const spot of regionConfig.spots) {
      const summary = summaries[spot.id];
      if (!summary) continue;

      const score = summary.score ?? 0;
      const bestWin = summary.bestWindow ?? null;
      const winDuration = bestWin?.durationHours ?? 0;

      // A spot has an eligible session if its best window meets the minimum continuous window
      // and quality score >= 60, regardless of the dominant daily state (e.g. even if morning was calm).
      const hasEligibleSession =
        score >= 60 &&
        bestWin !== null &&
        winDuration >= minWindowHours &&
        spotScores[spot.id] !== 0;

      candidates.push({
        id: spot.id,
        name: spot.name,
        score,
        bestWindow: bestWin,
        hasEligibleSession,
        style: summary.dominantStyle ?? spot.defaultStyle,
      });
    }

    // Filter qualifying session candidates
    const qualifyingCandidates = candidates.filter((c) => c.hasEligibleSession);

    let winner: SpotCandidate | null = null;

    if (qualifyingCandidates.length > 0) {
      // Sort by highest score, then continuous window duration
      qualifyingCandidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const durA = a.bestWindow?.durationHours ?? 0;
        const durB = b.bestWindow?.durationHours ?? 0;
        return durB - durA;
      });
      winner = qualifyingCandidates[0];
    }

    // 6. Generate rule-based explanations from region rulebook
    const explanations = generateRecommendationExplanation(
      regionConfig,
      winner ? winner.id : null,
      regimeId,
      summaries
    );

    return {
      bestSpot: winner ? winner.id : null,
      bestSpotName: winner ? winner.name : null,
      bestWindow: winner ? winner.bestWindow : null,
      score: winner ? winner.score : 0,
      spotScores,
      regime: regimeId as WindRegime,
      regimeLabel,
      sailingStyle: winner ? winner.style : "BUMP_AND_JUMP",
      explanation: explanations,
    };
  }
}

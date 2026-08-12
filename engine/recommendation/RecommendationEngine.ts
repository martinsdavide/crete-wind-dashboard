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
 * Classifies regional wind regime for a specific hour/timestamp context.
 */
export function classifyRegionalRegimeForHour(
  regionConfig: RegionConfig,
  context: {
    meanRawWind: number;
    meanDirectionDegrees: number;
    meanDirectionLabel?: WindDirection;
    precipitation12hMm?: number;
    currentPrecipitationMm?: number;
    localHour?: number;
    gustFactor?: number;
  }
): { regimeId: string; regimeLabel: string } {
  const dirLabel = context.meanDirectionLabel ?? degreesToCompass(context.meanDirectionDegrees);

  for (const regime of regionConfig.regimes) {
    const c = regime.criteria;

    const dirMatch = !c.directions || c.directions.length === 0 || c.directions.includes(dirLabel);
    const minWindMatch = c.minRawWind === undefined || context.meanRawWind >= c.minRawWind;
    const maxWindMatch = c.maxRawWind === undefined || context.meanRawWind <= c.maxRawWind;

    let precip12hMatch = true;
    if (c.minPrecipitation12hMm !== undefined) {
      precip12hMatch = (context.precipitation12hMm ?? 0) >= c.minPrecipitation12hMm;
    }

    let precipCurrentMatch = true;
    if (c.maxPrecipitationCurrentMm !== undefined) {
      precipCurrentMatch = (context.currentPrecipitationMm ?? 0) <= c.maxPrecipitationCurrentMm;
    }

    let hourMatch = true;
    if (c.allowedHours && context.localHour !== undefined) {
      const [startH, endH] = c.allowedHours;
      hourMatch = context.localHour >= startH && context.localHour <= endH;
    }

    if (dirMatch && minWindMatch && maxWindMatch && precip12hMatch && precipCurrentMatch && hourMatch) {
      return { regimeId: regime.id, regimeLabel: regime.label };
    }
  }

  return { regimeId: "OTHER_FLOW", regimeLabel: "Variable Airflow" };
}

/**
 * Classifies regional wind regime based on configured RegionConfig regime rules.
 */
export function classifyRegionalRegime(
  regionConfig: RegionConfig,
  spotForecasts: Record<string, SpotForecast | null | undefined>,
  referenceDate: Date = new Date()
): { regimeId: string; regimeLabel: string } {
  const fallbackRegime = {
    regimeId: "OTHER_FLOW",
    regimeLabel: "Variable Airflow",
  };

  const referenceForecasts: SpotForecast[] = [];
  for (const spot of regionConfig.spots) {
    const fc = spotForecasts[spot.id];
    if (fc) referenceForecasts.push(fc);
  }

  if (referenceForecasts.length === 0) {
    return fallbackRegime;
  }

  const rawWinds: number[] = [];
  const rawDirs: number[] = [];
  const precip12hs: number[] = [];
  const currPrecips: number[] = [];

  for (const fc of referenceForecasts) {
    if (fc.current) {
      rawWinds.push(fc.current.modelWind);
      rawDirs.push(fc.current.directionDegrees);
      if (fc.current.precipitation12hMm !== undefined) {
        precip12hs.push(fc.current.precipitation12hMm);
      }
      if (fc.current.precipitationMm !== undefined) {
        currPrecips.push(fc.current.precipitationMm);
      }
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

  const meanPrecip12h =
    precip12hs.length > 0
      ? precip12hs.reduce((a, b) => a + b, 0) / precip12hs.length
      : 0;

  const meanCurrPrecip =
    currPrecips.length > 0
      ? currPrecips.reduce((a, b) => a + b, 0) / currPrecips.length
      : 0;

  let localHour = 12;
  try {
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: regionConfig.timezone || "Europe/Athens",
      hour: "2-digit",
      hour12: false,
    }).format(referenceDate);
    localHour = parseInt(hourStr, 10);
  } catch {}

  return classifyRegionalRegimeForHour(regionConfig, {
    meanRawWind,
    meanDirectionDegrees: meanDirDeg,
    precipitation12hMm: meanPrecip12h,
    currentPrecipitationMm: meanCurrPrecip,
    localHour,
  });
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
      validForecasts,
      referenceDate
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
          let matchesDir = false;

          if (gate.directionRange) {
            const [minD, maxD] = gate.directionRange;
            if (minD <= maxD) {
              matchesDir = dominantDir >= minD && dominantDir <= maxD;
            } else {
              matchesDir = dominantDir >= minD || dominantDir <= maxD;
            }
          }

          let matchesWind = false;
          if (gate.minWind !== undefined && todaySummary.daytimeMaxWind >= gate.minWind) {
            matchesWind = true;
          }
          if (gate.maxWind !== undefined && todaySummary.daytimeMinWind <= gate.maxWind) {
            matchesWind = true;
          }

          let matchesMarine = false;
          if (gate.minWaveHeight !== undefined) {
            const maxWave = todaySummary.waveHeightRange?.max ?? 0;
            if (maxWave >= gate.minWaveHeight) matchesMarine = true;
          }
          if (gate.maxWaveHeight !== undefined) {
            const minWave = todaySummary.waveHeightRange?.min ?? 0;
            if (minWave <= gate.maxWaveHeight) matchesMarine = true;
          }

          const hasCriteria =
            gate.regimes !== undefined ||
            gate.directionRange !== undefined ||
            gate.minWind !== undefined ||
            gate.maxWind !== undefined ||
            gate.minWaveHeight !== undefined ||
            gate.maxWaveHeight !== undefined;

          const triggered =
            matchesRegime &&
            (gate.directionRange ? matchesDir : true) &&
            (gate.minWind !== undefined || gate.maxWind !== undefined ? matchesWind : true) &&
            (gate.minWaveHeight !== undefined || gate.maxWaveHeight !== undefined ? matchesMarine : true) &&
            hasCriteria;

          return triggered && gate.eligibility === "UNSUITABLE";
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

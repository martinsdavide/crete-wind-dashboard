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
import { resolveMinimumPlaningWind } from "@/lib/windThresholds";
import { isSpotOperatingHour } from "@/lib/solar";

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

    let convectiveMatch = true;
    if (c.convectiveThresholdGustRatio !== undefined) {
      convectiveMatch = context.gustFactor !== undefined && context.gustFactor >= c.convectiveThresholdGustRatio;
    }

    if (dirMatch && minWindMatch && maxWindMatch && precip12hMatch && precipCurrentMatch && hourMatch && convectiveMatch) {
      return { regimeId: regime.id, regimeLabel: regime.label };
    }
  }

  const fallbackId = regionConfig.id === "maremma" ? "MAREMMA_OTHER" : "OTHER_FLOW";
  return { regimeId: fallbackId, regimeLabel: "Variable Airflow" };
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

  // Resolve target local date string
  let targetDateStr = "";
  try {
    targetDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: regionConfig.timezone || "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(referenceDate);
  } catch {
    targetDateStr = referenceDate.toISOString().split("T")[0];
  }

  const rawWinds: number[] = [];
  const rawGusts: number[] = [];
  const rawDirs: number[] = [];
  const precip12hs: number[] = [];
  const currPrecips: number[] = [];

  for (const fc of referenceForecasts) {
    let currentTargetDateStr = "";
    if (fc.current?.timestamp) {
      try {
        currentTargetDateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: regionConfig.timezone || "Europe/Athens",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(fc.current.timestamp));
      } catch {
        currentTargetDateStr = fc.current.timestamp.split("T")[0];
      }
    }

    const isCurrentDay = currentTargetDateStr === targetDateStr;

    if (isCurrentDay && fc.current) {
      rawWinds.push(fc.current.modelWind);
      rawDirs.push(fc.current.directionDegrees);
      if (fc.current.modelGust) rawGusts.push(fc.current.modelGust);
      if (fc.current.precipitation12hMm !== undefined) {
        precip12hs.push(fc.current.precipitation12hMm);
      }
      if (fc.current.precipitationPreviousHourMm !== undefined) {
        currPrecips.push(fc.current.precipitationPreviousHourMm);
      }
    } else if (fc.hourly && fc.hourly.length > 0) {
      // Find hourly points on the target date
      const targetHours = fc.hourly.filter((h) => {
        let hDateStr = "";
        try {
          hDateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: regionConfig.timezone || "Europe/Athens",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(h.timestamp));
        } catch {
          hDateStr = h.timestamp.split("T")[0];
        }
        return hDateStr === targetDateStr;
      });

      // Filter to spot configured operating hours
      const spotConfig = regionConfig.spots.find((s) => s.id === fc.spot?.id);
      const operatingHours = targetHours.filter((h) => {
        if (spotConfig) {
          return isSpotOperatingHour(h.timestamp, spotConfig, regionConfig.timezone);
        }
        return true;
      });

      const relevantHours = operatingHours.length > 0 ? operatingHours : targetHours;

      if (relevantHours.length > 0) {
        const spotMeanWind =
          relevantHours.reduce((sum, h) => sum + h.modelWind, 0) / relevantHours.length;
        const spotMeanGust =
          relevantHours.reduce((sum, h) => sum + (h.modelGust ?? h.modelWind), 0) /
          relevantHours.length;

        let sSin = 0;
        let sCos = 0;
        for (const h of relevantHours) {
          const rad = (h.directionDegrees * Math.PI) / 180;
          sSin += Math.sin(rad);
          sCos += Math.cos(rad);
        }
        const spotMeanDir = (Math.atan2(sSin, sCos) * (180 / Math.PI) + 360) % 360;

        rawWinds.push(spotMeanWind);
        rawGusts.push(spotMeanGust);
        rawDirs.push(spotMeanDir);

        const maxPrecip12h = Math.max(...relevantHours.map((h) => h.precipitation12hMm ?? 0));
        const maxCurrPrecip = Math.max(
          ...relevantHours.map((h) => h.precipitationPreviousHourMm ?? 0)
        );
        precip12hs.push(maxPrecip12h);
        currPrecips.push(maxCurrPrecip);
      } else if (fc.current) {
        rawWinds.push(fc.current.modelWind);
        rawDirs.push(fc.current.directionDegrees);
        if (fc.current.modelGust) rawGusts.push(fc.current.modelGust);
      }
    } else if (fc.current) {
      rawWinds.push(fc.current.modelWind);
      rawDirs.push(fc.current.directionDegrees);
      if (fc.current.modelGust) rawGusts.push(fc.current.modelGust);
    }
  }

  const meanRawWind =
    rawWinds.length > 0
      ? rawWinds.reduce((a, b) => a + b, 0) / rawWinds.length
      : 15;

  const meanRawGust =
    rawGusts.length > 0
      ? rawGusts.reduce((a, b) => a + b, 0) / rawGusts.length
      : meanRawWind;
  const gustFactor = meanRawWind > 0 ? meanRawGust / meanRawWind : 1.0;

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
    gustFactor,
  });
}

export interface PostFusionSpotPrimitive {
  spotId: string;
  effectiveWind: number; // fused local wind speed in kt (or pre-fusion model wind)
  effectiveGust: number; // fused local gust speed in kt (or pre-fusion model gust)
  effectiveDirection: number; // resolved bounded fused direction in degrees (0–359)
  precipitation12hMm?: number;
  precipitationPreviousHourMm?: number;
}

/**
 * Dedicated post-fusion NOW regime classifier.
 * Operates on prepared effective local observation/forecast primitives across the region.
 */
export function classifyPostFusionNowRegime(
  regionConfig: RegionConfig,
  primitives: PostFusionSpotPrimitive[],
  referenceDate: Date = new Date()
): { regimeId: string; regimeLabel: string } {
  const fallbackRegime = {
    regimeId: regionConfig.id === "maremma" ? "MAREMMA_OTHER" : "OTHER_FLOW",
    regimeLabel: "Variable Airflow",
  };

  if (!primitives || primitives.length === 0) {
    return fallbackRegime;
  }

  const winds: number[] = [];
  const gusts: number[] = [];
  const dirs: number[] = [];
  const precip12hs: number[] = [];
  const currPrecips: number[] = [];

  for (const p of primitives) {
    winds.push(p.effectiveWind);
    dirs.push(p.effectiveDirection);
    gusts.push(p.effectiveGust);
    if (p.precipitation12hMm !== undefined) precip12hs.push(p.precipitation12hMm);
    if (p.precipitationPreviousHourMm !== undefined) currPrecips.push(p.precipitationPreviousHourMm);
  }

  const meanEffectiveWind =
    winds.length > 0 ? winds.reduce((a, b) => a + b, 0) / winds.length : 15;
  const meanEffectiveGust =
    gusts.length > 0 ? gusts.reduce((a, b) => a + b, 0) / gusts.length : meanEffectiveWind;
  const gustFactor = meanEffectiveWind > 0 ? meanEffectiveGust / meanEffectiveWind : 1.0;

  // Trigonometric vector averaging for direction (properly wraps around 0° / 360°)
  let sinSum = 0;
  let cosSum = 0;
  for (const d of dirs) {
    const rad = (d * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const meanDirDeg = (Math.atan2(sinSum, cosSum) * (180 / Math.PI) + 360) % 360;

  const meanPrecip12h =
    precip12hs.length > 0 ? precip12hs.reduce((a, b) => a + b, 0) / precip12hs.length : 0;
  const meanCurrPrecip =
    currPrecips.length > 0 ? currPrecips.reduce((a, b) => a + b, 0) / currPrecips.length : 0;

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
    meanRawWind: meanEffectiveWind,
    meanDirectionDegrees: meanDirDeg,
    precipitation12hMm: meanPrecip12h,
    currentPrecipitationMm: meanCurrPrecip,
    localHour,
    gustFactor,
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

    // 2. Classify residual regional regime (used as fallback when no spot qualifies)
    const { regimeId: residualRegimeId, regimeLabel: residualRegimeLabel } = classifyRegionalRegime(
      regionConfig,
      validForecasts,
      referenceDate
    );

    // 3. Resolve target date in the region's configured timezone (e.g. "YYYY-MM-DD")
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

    // 4. Extract target day summaries strictly (no silent fallback to days[0])
    const summaries: Record<string, DailyWindSummary | null> = {};
    const spotScores: Record<string, number | null> = {};

    for (const spot of regionConfig.spots) {
      const forecast = validForecasts[spot.id];
      if (forecast && forecast.days && forecast.days.length > 0) {
        const todaySummary = forecast.days.find((d) => d.date === todayDateStr) ?? null;
        summaries[spot.id] = todaySummary;

        if (todaySummary) {
          const bestWin = todaySummary.bestWindow ?? null;
          const bestWinScore = bestWin ? (bestWin.score ?? bestWin.meanScore ?? 0) : 0;
          spotScores[spot.id] = bestWin ? Math.round(bestWinScore) : 0;
        } else {
          spotScores[spot.id] = null;
        }
      } else {
        summaries[spot.id] = null;
        spotScores[spot.id] = null;
      }
    }

    // 5. Rank spot candidates based on Best Window quality and availability
    interface SpotCandidate {
      id: string;
      name: string;
      score: number;
      bestWindow: BestWindow | null;
      hasEligibleSession: boolean;
      style: WaterState;
      recommendationMode: "NOW" | "FORECAST_WINDOW" | "NONE";
      evidence: import("@/types/weather").RecommendationEvidence | null;
      observationAgeMinutes?: number;
      observationFreshness?: import("@/engine/observations/types").ObservationFreshness;
      validUntil?: string;
      spotIndex: number;
    }

    const candidates: SpotCandidate[] = [];
    const minWindowHours = SCORING_CONFIG.bestWindow?.minConsecutiveHours || 2;

    for (let sIdx = 0; sIdx < regionConfig.spots.length; sIdx++) {
      const spot = regionConfig.spots[sIdx];
      const forecast = validForecasts[spot.id];
      const summary = summaries[spot.id];
      if (!summary || !forecast) continue;

      const bestWin = summary.bestWindow ?? null;
      const bestWinScore = bestWin ? (bestWin.score ?? bestWin.meanScore ?? 0) : 0;
      const winDuration = bestWin?.durationHours ?? 0;

      // Evaluate NOW suitability ONLY if referenceDate is the current local day
      const current = forecast.current;
      const fusion = forecast.observationFusion ?? forecast.current?.observationFusion;

      let currentLocalDayStr = "";
      if (current?.timestamp) {
        try {
          currentLocalDayStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: regionConfig.timezone || "Europe/Athens",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(current.timestamp));
        } catch {
          currentLocalDayStr = current.timestamp.split("T")[0];
        }
      }

      const isCurrentDay = currentLocalDayStr === todayDateStr;
      const isOperating = isSpotOperatingHour(
        current?.timestamp || referenceDate.toISOString(),
        spot,
        regionConfig.timezone
      );

      let hasNowSession = false;
      let nowEvidence: import("@/types/weather").RecommendationEvidence = "FORECAST_NOW";
      let obsAgeMinutes: number | undefined = undefined;
      let obsFreshness: import("@/engine/observations/types").ObservationFreshness | undefined = undefined;
      let nowPersistenceMinutes = 60;

      const spotMinWind = resolveMinimumPlaningWind(spot);
      const spotMaxWind = spot.maxWindSpeedKt ?? 40;

      if (
        isCurrentDay &&
        isOperating &&
        current &&
        current.eligibility !== "UNSUITABLE" &&
        current.sessionQualityScore >= 60 &&
        current.localWind >= spotMinWind &&
        current.localWind <= spotMaxWind
      ) {
        if (fusion && fusion.windObservationUsed) {
          const mainObsContrib = fusion.contributors.find(
            (c) => c.effectsApplied.includes("speed-bias") || c.effectsApplied.includes("current-condition")
          );
          obsAgeMinutes = mainObsContrib?.ageMinutes ?? (fusion.latestObservedAt ? Math.round((referenceDate.getTime() - new Date(fusion.latestObservedAt).getTime()) / 60000) : 0);

          if (fusion.windFusionStatus === "available") {
            nowEvidence = "FRESH_OBSERVATION";
            obsFreshness = "FRESH";
            nowPersistenceMinutes = Math.max(30, Math.min(90, 90 - (obsAgeMinutes ?? 0)));
          } else if (fusion.windFusionStatus === "degraded") {
            nowEvidence = "DELAYED_OBSERVATION";
            obsFreshness = "DELAYED";
            nowPersistenceMinutes = Math.max(15, Math.min(45, 90 - (obsAgeMinutes ?? 0)));
          } else {
            nowEvidence = "FORECAST_NOW";
          }
          hasNowSession = true;
        } else if (current.localWind >= spotMinWind) {
          nowEvidence = "FORECAST_NOW";
          hasNowSession = true;
          nowPersistenceMinutes = 60;
        }
      }

      let nowWindow: BestWindow | null = null;
      let validUntilIso: string | undefined = undefined;

      if (hasNowSession && current) {
        const validUntilDate = new Date(referenceDate.getTime() + nowPersistenceMinutes * 60 * 1000);
        validUntilIso = validUntilDate.toISOString();

        const formatTime = (d: Date) => {
          try {
            return new Intl.DateTimeFormat("en-GB", {
              timeZone: regionConfig.timezone || "Europe/Athens",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(d);
          } catch {
            return d.toISOString().substring(11, 16);
          }
        };

        nowWindow = {
          start: formatTime(referenceDate),
          end: formatTime(validUntilDate),
          startIso: referenceDate.toISOString(),
          endIso: validUntilIso,
          durationHours: Math.round((nowPersistenceMinutes / 60) * 100) / 100,
          minWind: current.localWind,
          maxWind: current.localGust,
          dominantDirection: current.directionLabel,
          dominantDirectionDegrees: current.directionDegrees,
          meanScore: current.sessionQualityScore,
          score: current.sessionQualityScore,
          sailingStyle: current.waterState,
          condition: current.condition,
          evidence: nowEvidence,
          dominantRegimeId: current.regimeId,
        };
      }

      // Populate todayCurrentOverlay on forecast ONLY if evaluating current day
      if (isCurrentDay && current) {
        forecast.todayCurrentOverlay = {
          currentScore: current.sessionQualityScore,
          currentCondition: current.condition,
          currentEligibility: current.eligibility,
          currentWaterState: current.waterState,
          currentWindow: nowWindow,
          source: nowEvidence,
        };
      }

      const hasForecastSession =
        bestWin !== null &&
        winDuration >= minWindowHours &&
        bestWinScore >= 60;

      if (hasNowSession) {
        candidates.push({
          id: spot.id,
          name: spot.name,
          score: current?.sessionQualityScore ?? bestWinScore,
          bestWindow: nowWindow,
          hasEligibleSession: true,
          style: current?.waterState ?? summary.dominantStyle ?? spot.defaultStyle,
          recommendationMode: "NOW",
          evidence: nowEvidence,
          observationAgeMinutes: obsAgeMinutes,
          observationFreshness: obsFreshness,
          validUntil: validUntilIso,
          spotIndex: sIdx,
        });
      } else if (hasForecastSession) {
        candidates.push({
          id: spot.id,
          name: spot.name,
          score: bestWinScore,
          bestWindow: bestWin,
          hasEligibleSession: true,
          style: summary.dominantStyle ?? spot.defaultStyle,
          recommendationMode: "FORECAST_WINDOW",
          evidence: "FORECAST_WINDOW",
          spotIndex: sIdx,
        });
      } else {
        candidates.push({
          id: spot.id,
          name: spot.name,
          score: bestWinScore,
          bestWindow: bestWin,
          hasEligibleSession: false,
          style: summary.dominantStyle ?? spot.defaultStyle,
          recommendationMode: "NONE",
          evidence: null,
          spotIndex: sIdx,
        });
      }
    }

    // Filter qualifying session candidates
    const qualifyingCandidates = candidates.filter((c) => c.hasEligibleSession);

    let winner: SpotCandidate | null = null;

    if (qualifyingCandidates.length > 0) {
      // Sort priority: NOW mode with live/delayed observation > NOW mode forecast > FORECAST_WINDOW mode
      qualifyingCandidates.sort((a, b) => {
        const getPriority = (c: SpotCandidate) => {
          if (c.recommendationMode === "NOW") {
            if (c.evidence === "FRESH_OBSERVATION") return 4;
            if (c.evidence === "DELAYED_OBSERVATION") return 3;
            if (c.evidence === "FORECAST_NOW") return 2;
          }
          if (c.recommendationMode === "FORECAST_WINDOW") return 1;
          return 0;
        };

        const prioA = getPriority(a);
        const prioB = getPriority(b);

        if (prioB !== prioA) return prioB - prioA;

        // 1. Best Window Score (or NOW score)
        if (b.score !== a.score) return b.score - a.score;

        // 2. Best Window Duration
        const durA = a.bestWindow?.durationHours ?? 0;
        const durB = b.bestWindow?.durationHours ?? 0;
        if (durB !== durA) return durB - durA;

        // 3. Stability Score
        const stabA = a.bestWindow?.stability?.stabilityScore ?? 0;
        const stabB = b.bestWindow?.stability?.stabilityScore ?? 0;
        if (stabB !== stabA) return stabB - stabA;

        // 4. Configured spot order index (final tie-breaker)
        return a.spotIndex - b.spotIndex;
      });
      winner = qualifyingCandidates[0];
    }

    // 6. Derive displayed recommendation regime
    let finalRegimeId: string = residualRegimeId;
    if (winner && winner.recommendationMode === "NOW") {
      finalRegimeId = validForecasts[winner.id]?.current?.regimeId ?? residualRegimeId;
    } else if (winner && winner.recommendationMode === "FORECAST_WINDOW") {
      finalRegimeId = winner.bestWindow?.dominantRegimeId ?? residualRegimeId;
    } else {
      finalRegimeId = residualRegimeId;
    }

    const finalRegimeDef = regionConfig.regimes.find((r) => r.id === finalRegimeId);
    const finalRegimeLabel = finalRegimeDef?.label ?? residualRegimeLabel;

    // 7. Generate rule-based explanations from region rulebook
    const currentReasonCodes =
      winner && winner.recommendationMode === "NOW" && winner.id && validForecasts[winner.id]?.current?.reasonCodes
        ? validForecasts[winner.id]?.current?.reasonCodes
        : undefined;

    const explanations = generateRecommendationExplanation(
      regionConfig,
      winner ? winner.id : null,
      finalRegimeId,
      summaries,
      currentReasonCodes
    );

    return {
      bestSpot: winner ? winner.id : null,
      bestSpotName: winner ? winner.name : null,
      bestWindow: winner ? winner.bestWindow : null,
      score: winner ? winner.score : 0,
      spotScores,
      regime: finalRegimeId as WindRegime,
      regimeLabel: finalRegimeLabel,
      sailingStyle: winner ? winner.style : "BUMP_AND_JUMP",
      explanation: explanations,
      mode: winner ? winner.recommendationMode : "NONE",
      evidence: winner ? winner.evidence : null,
      observationAgeMinutes: winner?.observationAgeMinutes,
      observationFreshness: winner?.observationFreshness,
      validUntil: winner?.validUntil,
    };
  }
}

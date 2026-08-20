import { RegionSpotConfig, ThermalEvaluation } from "@/types/region";
import {
  DailyWindSummary,
  DiagnosticReasonCode,
  HourlyWind,
  SpotEligibility,
  SpotForecast,
  WaterState,
  WindDirection,
} from "@/types/weather";
import {
  compassToArrowRotation,
  degreesToCompass,
  getDominantDirection,
  normalizeDegrees,
} from "@/lib/windDirection";
import {
  getConditionLabel,
  getWindClassification,
  calculateGustinessScore,
} from "@/lib/windScore";
import { getLocalTimeComponents } from "@/lib/localWind";
import { getSolarWindow, isSpotOperatingHour } from "@/lib/solar";
import { findBestWindow } from "@/lib/bestWindow";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { evaluateHourQuality } from "../scoring/SessionQuality";
import {
  evaluateDirectionScore,
  evaluateForecastConfidence,
} from "../scoring/DirectionEvaluator";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { evaluateSeaState } from "../marine/SeaStateEvaluator";
import { evaluateLakeState } from "../marine/LakeStateEvaluator";
import { MarineForecast, MarineForecastPoint, SeaStateEvaluation } from "@/types/marine";

/**
 * Derives structured diagnostic reason codes for an hourly point.
 */
export function deriveHourlyReasonCodes(
  spotConfig: RegionSpotConfig,
  eligibilityReason: string | undefined,
  thermal: {
    state?: "ABSENT" | "BUILDING" | "ACTIVE" | "DECAYING" | "UNKNOWN";
    strength?: number;
    additiveBoostKt?: number;
    multiplicativeBoost?: number;
    contributingFactors?: string[];
    limitingFactors?: string[];
    reasonCodes?: DiagnosticReasonCode[];
  } | ThermalEvaluation | undefined,
  regimeId: string | undefined,
  fusion?: import("@/engine/observations/types").ObservationFusionResult
): DiagnosticReasonCode[] {
  const codes: DiagnosticReasonCode[] = [];

  if (eligibilityReason === "OFFSHORE_MELTEMI") {
    codes.push("OFFSHORE_MELTEMI");
  }

  if (spotConfig.id === "xerokampos" && (regimeId === "WESTERLY" || regimeId === "SOUTHERLY")) {
    codes.push("XEROKAMPOS_WESTERLY_SUPPORT");
  }

  if (thermal) {
    if (thermal.state === "ACTIVE") {
      codes.push("THERMAL_ACTIVE");
    } else if (thermal.state === "BUILDING") {
      codes.push("THERMAL_BUILDING");
    } else if (thermal.state === "DECAYING") {
      codes.push("THERMAL_DECAYING");
    }

    if (thermal.limitingFactors?.includes("THERMAL_CLOUD_SUPPRESSION")) {
      codes.push("THERMAL_CLOUD_SUPPRESSION");
    }
    if (thermal.limitingFactors?.includes("THERMAL_SYNOPTIC_SUPPRESSION")) {
      codes.push("THERMAL_SYNOPTIC_SUPPRESSION");
    }
    if (thermal.limitingFactors?.includes("THERMAL_DIRECTION_LIMITATION")) {
      codes.push("THERMAL_DIRECTION_SUPPRESSION");
    }
    if (thermal.contributingFactors?.includes("THERMAL_SEASON_SUPPORT")) {
      codes.push("THERMAL_SEASON_SUPPORT");
    }
    if (thermal.contributingFactors?.includes("THERMAL_TIME_SUPPORT")) {
      codes.push("THERMAL_TIME_SUPPORT");
    }
    if (thermal.contributingFactors?.includes("THERMAL_DIRECTION_SUPPORT")) {
      codes.push("THERMAL_DIRECTION_SUPPORT");
    }
  }

  if (fusion) {
    if (fusion.status === "stale") {
      codes.push("OBSERVATION_STALE");
    } else if (fusion.status === "available" || fusion.status === "partial") {
      if (fusion.confidenceAdjustment > 0) {
        codes.push("THERMAL_OBSERVATION_SUPPORT");
      } else if (fusion.confidenceAdjustment < 0) {
        codes.push("THERMAL_OBSERVATION_CONTRADICTION");
      }
    }
  }

  return Array.from(new Set(codes));
}

/**
 * Linear interpolation helper across a numeric sequence.
 */
export function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Generic linear interpolation across an array of control points sorted by x ascending.
 */
export function interpolateCurve(
  x: number,
  points: { x: number; y: number }[]
): number {
  if (!points || points.length === 0) return 1.0;
  if (points.length === 1) return points[0].y;

  // Clamp left
  if (x <= points[0].x) return points[0].y;
  // Clamp right
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (x >= p1.x && x <= p2.x) {
      if (p2.x === p1.x) return p1.y;
      const t = (x - p1.x) / (p2.x - p1.x);
      return p1.y + t * (p2.y - p1.y);
    }
  }

  return points[points.length - 1].y;
}

/**
 * Interpolates between two angles in degrees (0-360) along the shortest arc.
 */
export function interpolateDirection(degA: number, degB: number, t: number): number {
  const normA = normalizeDegrees(degA);
  const normB = normalizeDegrees(degB);
  let diff = normB - normA;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normalizeDegrees(normA + diff * t);
}

export const interpolateAngle = interpolateDirection;

/**
 * Calculates dynamic thermal strength and boost contribution based on:
 * Season x Time-of-day x Wind direction x Synoptic wind intensity x Solar heating / Cloud cover.
 */
import { ThermalEffectEvaluator } from "./ThermalEffectEvaluator";

/**
 * Calculates dynamic thermal strength and boost contribution based on:
 * Season x Time-of-day x Wind direction x Synoptic wind intensity x Solar heating / Cloud cover.
 */
export function calculateThermalStrength(
  spotConfig: RegionSpotConfig,
  timestamp: string | Date,
  directionLabel: WindDirection,
  modelWind = 12,
  cloudCover = 0,
  timeZone = "Europe/Athens",
  solarRadiation?: number,
  regimeId?: string,
  previousEvaluation?: { additiveBoostKt?: number } | ThermalEvaluation,
  deltaHours?: number
): ThermalEvaluation {
  return ThermalEffectEvaluator.evaluate(
    spotConfig,
    timestamp,
    directionLabel,
    modelWind,
    cloudCover,
    timeZone,
    solarRadiation,
    regimeId,
    previousEvaluation,
    deltaHours
  );
}

/**
 * Calculates dynamic local correction factor using the spot's injected configuration and regional timezone.
 */
export function calculateLocalCorrectionFactor(
  spotConfig: RegionSpotConfig,
  timestamp: string | Date,
  directionLabel: WindDirection,
  directionDegrees: number,
  modelWind = 12,
  cloudCover = 0,
  timeZone = "Europe/Athens",
  regimeId?: string,
  precipitation12hMm?: number,
  solarRadiation?: number,
  previousEvaluation?: { additiveBoostKt?: number } | ThermalEvaluation,
  deltaHours?: number
): {
  factor: number;
  effectiveDirection: WindDirection;
  effectiveDegrees: number;
  thermal: ThermalEvaluation;
} {
  const cfg = spotConfig.localCorrection;
  let factor = cfg.baseCorrectionFactor;
  let effectiveDirection = directionLabel;
  let effectiveDegrees = directionDegrees;

  const { month, hour } = getLocalTimeComponents(timestamp, timeZone);

  // 1. Seasonal / Summer Boost (applied only if not configured with dynamic thermal)
  const isDynamicThermal =
    cfg.diurnalThermalBoost &&
    "model" in cfg.diurnalThermalBoost &&
    cfg.diurnalThermalBoost.model === "DYNAMIC";

  if (!isDynamicThermal && cfg.summerBoostMonths && cfg.summerBoostMonths.includes(month)) {
    factor += cfg.summerBoostAmount ?? 0.10;
  }

  // 2. Diurnal Thermal Boost (evaluated strictly from raw model wind)
  const thermal = calculateThermalStrength(
    spotConfig,
    timestamp,
    directionLabel,
    modelWind,
    cloudCover,
    timeZone,
    solarRadiation,
    regimeId,
    previousEvaluation,
    deltaHours
  );

  // Exclude additive/hybrid adjustments from factor calculations
  if (thermal.active && (thermal.correctionMode === "MULTIPLICATIVE" || thermal.correctionMode === "HYBRID")) {
    factor += thermal.multiplicativeBoost ?? thermal.boost;
  }

  // 2b. Conditional Boosts (Generic replacement for postRainBoost checking)
  if (cfg.conditionalBoosts && cfg.conditionalBoosts.length > 0) {
    for (const boost of cfg.conditionalBoosts) {
      if (boost.applicableRegimeIds && regimeId && !boost.applicableRegimeIds.includes(regimeId)) {
        continue;
      }
      if (boost.localTimeWindow) {
        if (hour < boost.localTimeWindow.startHour || hour > boost.localTimeWindow.endHour) {
          continue;
        }
      }
      if (boost.allowedDirectionSectors && boost.allowedDirectionSectors.length > 0) {
        const isDirAllowed = boost.allowedDirectionSectors.some((range) => {
          if (range.fromDeg <= range.toDeg) {
            return directionDegrees >= range.fromDeg && directionDegrees <= range.toDeg;
          } else {
            return directionDegrees >= range.fromDeg || directionDegrees <= range.toDeg;
          }
        });
        if (!isDirAllowed) {
          continue;
        }
      }
      if (boost.minModelWind !== undefined && modelWind < boost.minModelWind) {
        continue;
      }
      if (boost.maxModelWind !== undefined && modelWind > boost.maxModelWind) {
        continue;
      }
      if (boost.minRecentPrecipitation !== undefined && (precipitation12hMm ?? 0) < boost.minRecentPrecipitation) {
        continue;
      }
      const amount = boost.boostAmount ?? boost.maxAdditiveBoost ?? 0;
      factor += amount;
    }
  } else {
    // Legacy fallback postRainBoost for backward compatibility
    const minPrecip12h = cfg.postRainBoost?.minPrecipitation12hMm ?? 1.0;
    if (
      cfg.postRainBoost?.enabled &&
      regimeId &&
      regimeId.includes("POST_RAIN") &&
      (precipitation12hMm ?? 0) >= minPrecip12h
    ) {
      factor += cfg.postRainBoost.maxBoost ?? 0.20;
    }
  }

  // 3. Direction Modifiers
  if (cfg.directionModifiers && cfg.directionModifiers[directionLabel] !== undefined) {
    factor += cfg.directionModifiers[directionLabel]!;
  }

  // 4. Direction Deflection
  if (cfg.directionDeflections && cfg.directionDeflections[directionLabel]) {
    effectiveDirection = cfg.directionDeflections[directionLabel]!;
  }

  // Clamping
  const clampedFactor = Math.max(cfg.minFactor, Math.min(cfg.maxFactor, factor));

  return {
    factor: clampedFactor,
    effectiveDirection,
    effectiveDegrees,
    thermal,
  };
}

/**
 * Maps water state classification according to spot configuration rules.
 */
export function estimateSpotWaterState(
  spotConfig: RegionSpotConfig,
  localWind: number,
  directionLabel: WindDirection
): WaterState {
  const rules = spotConfig.styleRules;
  if (!rules) return spotConfig.defaultStyle || "BUMP_AND_JUMP";

  const isFavoredDirection =
    !rules.favoredDirections || rules.favoredDirections.includes(directionLabel);

  if (
    rules.waveThresholdWind &&
    localWind >= rules.waveThresholdWind &&
    isFavoredDirection
  ) {
    return "WAVE";
  }

  if (
    rules.bumpAndJumpThresholdWind &&
    localWind >= rules.bumpAndJumpThresholdWind &&
    isFavoredDirection
  ) {
    return "BUMP_AND_JUMP";
  }

  return spotConfig.defaultStyle || "BUMP_AND_JUMP";
}

/**
 * Normalizes a single raw forecast point into a full domain HourlyWind object.
 */
export function normalizeHourlyPoint(
  spotConfig: RegionSpotConfig,
  point: {
    timestamp: string;
    windSpeed: number;
    windGust: number;
    windDirection: number;
    temperature?: number;
    cloudCover?: number;
    /** Open-Meteo preceding-hour total (mm) — NOT an instantaneous rate */
    precipitationPreviousHourMm?: number;
    precipitation6hMm?: number;
    precipitation12hMm?: number;
    marine?: MarineForecastPoint | null;
  },
  referenceDate: Date = new Date(),
  regimeId?: string,
  timeZone = "Europe/Athens",
  previousPoint?: HourlyWind,
  deltaHours?: number
): HourlyWind {
  const rawDirectionLabel = degreesToCompass(point.windDirection);

  const { factor, effectiveDirection, effectiveDegrees, thermal } =
    calculateLocalCorrectionFactor(
      spotConfig,
      point.timestamp,
      rawDirectionLabel,
      point.windDirection,
      point.windSpeed,
      point.cloudCover,
      timeZone,
      regimeId,
      point.precipitation12hMm,
      undefined,
      previousPoint?.thermal,
      deltaHours
    );

  const baseCorrectedWindKt = Math.round(point.windSpeed * factor * 10) / 10;
  let preObservationLocalWindKt = baseCorrectedWindKt;
  if (thermal && thermal.active && (thermal.correctionMode === "ADDITIVE" || thermal.correctionMode === "HYBRID")) {
    preObservationLocalWindKt += thermal.additiveBoostKt || 0;
  }

  // Apply maxThermalCorrectedWindKt (thermal plausibility cap) before observation fusion
  const maxThermalCap = (spotConfig.localCorrection.diurnalThermalBoost as any)?.maxThermalCorrectedWindKt;
  if (maxThermalCap !== undefined && maxThermalCap > 0) {
    preObservationLocalWindKt = Math.min(preObservationLocalWindKt, maxThermalCap);
  }
  preObservationLocalWindKt = Math.round(preObservationLocalWindKt * 10) / 10;

  let localWind = Math.max(0, preObservationLocalWindKt);
  let localGust = Math.max(localWind, (point.windGust || point.windSpeed * 1.25) * factor);
  if (thermal && thermal.active && (thermal.correctionMode === "ADDITIVE" || thermal.correctionMode === "HYBRID")) {
    localGust += thermal.additiveBoostKt || 0;
  }
  if (maxThermalCap !== undefined && maxThermalCap > 0) {
    localGust = Math.min(localGust, Math.max(localWind, maxThermalCap * 1.25));
  }
  localGust = Math.round(localGust * 10) / 10;

  const directionScore = evaluateDirectionScore(spotConfig, effectiveDirection);

  const pointDate = new Date(point.timestamp);
  const forecastHorizonHours = Math.max(
    0,
    (pointDate.getTime() - referenceDate.getTime()) / (1000 * 3600)
  );
  const { confidence, level: confidenceLevel } = evaluateForecastConfidence(
    forecastHorizonHours,
    directionScore,
    point.windSpeed
  );

  const gustScore = calculateGustinessScore(localWind, localGust);

  // Inland Lake State Model vs Offshore Marine Model
  let seaState: SeaStateEvaluation;
  let lakeStateSource: "LAKE_WIND_DERIVED" | "LOCAL_OBSERVATION" | "MANUAL_CALIBRATION" | undefined = undefined;

  if (spotConfig.lakeProfile) {
    seaState = evaluateLakeState(
      spotConfig,
      localWind,
      effectiveDirection,
      localGust
    );
    lakeStateSource = "LAKE_WIND_DERIVED";
  } else {
    seaState = evaluateSeaState(
      spotConfig,
      point.marine,
      localWind,
      effectiveDirection
    );
  }

  const quality = evaluateHourQuality(
    spotConfig,
    localWind,
    localGust,
    effectiveDegrees,
    effectiveDirection,
    directionScore,
    seaState,
    gustScore,
    confidence,
    regimeId
  );

  const classification = getWindClassification(localWind);
  const condition = getConditionLabel(quality.sessionQualityScore);

  const reasonCodes = deriveHourlyReasonCodes(
    spotConfig,
    quality.eligibilityReason,
    thermal,
    regimeId
  );

  return {
    timestamp: point.timestamp,
    modelWind: point.windSpeed,
    modelGust: point.windGust || point.windSpeed * 1.25,
    localWind,
    localGust,
    correctionFactor: factor,
    baseCorrectedWindKt,
    preObservationLocalWindKt,
    directionDegrees: effectiveDegrees,
    directionLabel: effectiveDirection,
    arrowRotation: compassToArrowRotation(effectiveDegrees),
    confidence,
    confidenceLevel,
    eligibility: quality.eligibility,
    eligibilityReason: quality.eligibilityReason as any,
    hardGateReason: quality.eligibility === "UNSUITABLE" ? quality.eligibilityReason : undefined,
    reasonCodes,
    waterState: quality.waterState,
    seaState,
    lakeStateSource,
    precipitationPreviousHourMm: point.precipitationPreviousHourMm,
    precipitation6hMm: point.precipitation6hMm,
    precipitation12hMm: point.precipitation12hMm,
    spotWindQuality: quality.spotWindQuality,
    directionQuality: quality.directionQuality,
    seaQualityScore: quality.seaQualityScore,
    waterStateQuality: quality.seaQualityScore,
    preferenceScore: quality.preferenceScore,
    sessionQualityScore: quality.sessionQualityScore,
    score: quality.sessionQualityScore,
    classification,
    condition,
    temperature: point.temperature,
    cloudCover: point.cloudCover,
    thermal: thermal
      ? {
          state: thermal.state || "ABSENT",
          strength: thermal.strength,
          confidence: thermal.confidence || 1.0,
          additiveBoostKt: thermal.additiveBoostKt || 0,
          multiplicativeBoost: thermal.multiplicativeBoost || 0,
          contributingFactors: thermal.contributingFactors,
          limitingFactors: thermal.limitingFactors,
          reasonCodes,
        }
      : undefined,
    regimeId,
    observationFusion: undefined,
  };
}

/**
 * Calculates current "NOW" conditions by linear interpolation between the two nearest hourly forecast points.
 */
export function calculateCurrentConditionsGeneric(
  spotConfig: RegionSpotConfig,
  hourly: HourlyWind[],
  currentTime = new Date(),
  timeZone = "Europe/Athens",
  regimeId?: string
): HourlyWind {
  if (hourly.length === 0) {
    throw new Error("No hourly data available for current condition estimation");
  }

  const targetMs = currentTime.getTime();
  let nextIdx = hourly.findIndex((h) => new Date(h.timestamp).getTime() >= targetMs);

  if (nextIdx <= 0) {
    return { ...hourly[0] };
  }

  if (nextIdx === -1) {
    return { ...hourly[hourly.length - 1] };
  }

  const prev = hourly[nextIdx - 1];
  const next = hourly[nextIdx];

  const prevMs = new Date(prev.timestamp).getTime();
  const nextMs = new Date(next.timestamp).getTime();
  const span = nextMs - prevMs;
  const t = span > 0 ? Math.max(0, Math.min(1, (targetMs - prevMs) / span)) : 0;

  const modelWind = prev.modelWind + t * (next.modelWind - prev.modelWind);
  const modelGust = prev.modelGust + t * (next.modelGust - prev.modelGust);
  const directionDegrees = interpolateAngle(prev.directionDegrees, next.directionDegrees, t);
  const temperature =
    prev.temperature !== undefined && next.temperature !== undefined
      ? prev.temperature + t * (next.temperature - prev.temperature)
      : prev.temperature;
  const cloudCover =
    prev.cloudCover !== undefined && next.cloudCover !== undefined
      ? prev.cloudCover + t * (next.cloudCover - prev.cloudCover)
      : prev.cloudCover;

  // Interpolate marine wave metrics if present from real marine model (using unattenuated raw wave height)
  let marinePoint: MarineForecastPoint | null = null;
  const prevSea = prev.seaState;
  const nextSea = next.seaState;

  if (
    prevSea &&
    nextSea &&
    prevSea.source === "MARINE_FORECAST" &&
    nextSea.source === "MARINE_FORECAST"
  ) {
    const prevRaw = prevSea.rawWaveHeight ?? prevSea.waveHeight;
    const nextRaw = nextSea.rawWaveHeight ?? nextSea.waveHeight;

    if (prevRaw !== null && prevRaw !== undefined && nextRaw !== null && nextRaw !== undefined) {
      const rawWaveHeight = prevRaw + t * (nextRaw - prevRaw);
      const wavePeriod =
        prevSea.wavePeriod !== null && nextSea.wavePeriod !== null
          ? prevSea.wavePeriod + t * (nextSea.wavePeriod - prevSea.wavePeriod)
          : prevSea.wavePeriod;
      const waveDirection =
        prevSea.waveDirection !== null && nextSea.waveDirection !== null
          ? interpolateAngle(prevSea.waveDirection, nextSea.waveDirection, t)
          : prevSea.waveDirection;

      marinePoint = {
        timestamp: currentTime.toISOString(),
        waveHeight: rawWaveHeight,
        wavePeriod,
        waveDirection,
        provider: "ECMWF WAM",
      };
    }
  }

  // Precipitation: Open-Meteo value at timestamp T represents total rainfall in [T-1h, T).
  // At any time between prev.timestamp and next.timestamp, the interval that *contains*
  // the current moment is the one ending at next.timestamp, i.e. [prev.timestamp, next.timestamp).
  // Therefore the semantically correct bucket is always `next`, not `prev`.
  // Do NOT linearly interpolate — that would synthesize phantom rain.
  const precipitationPreviousHourMm = next.precipitationPreviousHourMm;
  const precipitation6hMm = next.precipitation6hMm;
  const precipitation12hMm = next.precipitation12hMm;

  return normalizeHourlyPoint(
    spotConfig,
    {
      timestamp: currentTime.toISOString(),
      windSpeed: modelWind,
      windGust: modelGust,
      windDirection: directionDegrees,
      temperature,
      cloudCover,
      precipitationPreviousHourMm,
      precipitation6hMm,
      precipitation12hMm,
      marine: marinePoint,
    },
    currentTime,
    regimeId,
    timeZone
  );
}

/**
 * Extracts regional calendar date key (YYYY-MM-DD) based on regional timezone.
 */
export function getRegionalDateKey(
  timestamp: string | Date,
  timeZone = "Europe/Athens"
): string {
  try {
    const d = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    const s = typeof timestamp === "string" ? timestamp : timestamp.toISOString();
    return s.split("T")[0];
  }
}

/**
 * Aggregates normalized hourly data into daily wind and marine summaries using astronomical solar hours.
 */
export function calculateDailySummariesGeneric(
  hourly: HourlyWind[],
  spotConfig: RegionSpotConfig,
  timeZone = "Europe/Athens",
  referenceDate?: Date
): DailyWindSummary[] {
  const groups: Record<string, HourlyWind[]> = {};

  for (const h of hourly) {
    const dateKey = getRegionalDateKey(h.timestamp, timeZone);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(h);
  }

  let relevantDates = Object.keys(groups).sort();
  if (referenceDate) {
    const todayKey = getRegionalDateKey(referenceDate, timeZone);
    const filtered = relevantDates.filter((d) => d >= todayKey);
    if (filtered.length > 0) {
      relevantDates = filtered;
    }
  }

  const summaries: DailyWindSummary[] = [];

  for (const dateStr of relevantDates) {
    const hours = groups[dateStr];
    if (!hours || hours.length === 0) continue;

    const noonDate = new Date(`${dateStr}T12:00:00.000Z`);
    const solarWindow = getSolarWindow(
      noonDate,
      spotConfig.latitude,
      spotConfig.longitude,
      timeZone
    );

    const activeHours = hours.filter((h) => {
      return isSpotOperatingHour(h.timestamp, spotConfig, timeZone);
    });

    const candidateHours = activeHours.length > 0 ? activeHours : hours;

    const daytimeWinds = candidateHours.map((h) => h.localWind);
    const daytimeGusts = candidateHours.map((h) => h.localGust);
    const daytimeDirs = candidateHours.map((h) => h.directionDegrees);

    const daytimeMinWind = Math.min(...daytimeWinds);
    const daytimeMaxWind = Math.max(...daytimeWinds);

    const allWinds = hours.map((h) => h.localWind);
    const minWind = Math.min(...allWinds);
    const maxWind = Math.max(...allWinds);
    const maxGust = Math.max(...daytimeGusts);

    const { degrees: dominantDirectionDegrees, label: dominantDirection } =
      getDominantDirection(daytimeDirs);

    const eligibleScores = candidateHours
      .filter((h) => h.eligibility !== "UNSUITABLE")
      .map((h) => h.sessionQualityScore)
      .sort((a, b) => b - a);

    const topScores = eligibleScores.slice(0, 3);
    const dailyScore =
      topScores.length > 0
        ? Math.round(topScores.reduce((a, b) => a + b, 0) / topScores.length)
        : 0;

    const condition = getConditionLabel(dailyScore);

    // Dominant eligibility
    const eligibilityCounts: Record<string, number> = {};
    for (const h of candidateHours) {
      eligibilityCounts[h.eligibility] = (eligibilityCounts[h.eligibility] || 0) + 1;
    }
    let dominantEligibility = candidateHours[0].eligibility;
    let maxEligCount = 0;
    for (const [el, count] of Object.entries(eligibilityCounts)) {
      if (count > maxEligCount) {
        maxEligCount = count;
        dominantEligibility = el as SpotEligibility;
      }
    }

    // Dominant style & sea state
    const styleCounts: Record<string, number> = {};
    for (const h of candidateHours) {
      styleCounts[h.waterState] = (styleCounts[h.waterState] || 0) + 1;
    }
    let dominantStyle = spotConfig.defaultStyle;
    let maxStyleCount = 0;
    for (const [st, count] of Object.entries(styleCounts)) {
      if (count > maxStyleCount) {
        maxStyleCount = count;
        dominantStyle = st as WaterState;
      }
    }

    // Marine metrics
    const validWaveHeights = candidateHours
      .map((h) => h.seaState?.waveHeight)
      .filter((wh): wh is number => wh !== null && wh !== undefined);

    const waveHeightRange =
      validWaveHeights.length > 0
        ? { min: Math.min(...validWaveHeights), max: Math.max(...validWaveHeights) }
        : undefined;

    const bestSeaQuality =
      candidateHours.length > 0
        ? Math.max(...candidateHours.map((h) => h.seaQualityScore ?? h.seaState?.seaQualityScore ?? 0))
        : undefined;

    // Find Best Window
    const bestWindow = findBestWindow(
      hours,
      SCORING_CONFIG.bestWindow?.minScoreThreshold ?? 60,
      SCORING_CONFIG.bestWindow?.minConsecutiveHours ?? 2,
      timeZone,
      spotConfig.latitude,
      spotConfig.longitude,
      spotConfig.operatingWindow
    );

    let bestWindowReasonCodes: DiagnosticReasonCode[] | undefined = undefined;
    if (bestWindow && bestWindow.startIso && bestWindow.endIso) {
      const startMs = new Date(bestWindow.startIso).getTime();
      const endMs = new Date(bestWindow.endIso).getTime();
      const windowHours = hours.filter((h) => {
        const hMs = new Date(h.timestamp).getTime();
        return hMs >= startMs && hMs <= endMs;
      });
      bestWindowReasonCodes = Array.from(
        new Set(windowHours.flatMap((h) => h.reasonCodes || []))
      );
    }

    summaries.push({
      date: dateStr,
      minWind,
      maxWind,
      daytimeMinWind,
      daytimeMaxWind,
      maxGust,
      dominantDirection,
      dominantDirectionDegrees,
      score: dailyScore,
      condition,
      dominantEligibility,
      dominantStyle,
      dominantSeaState: dominantStyle,
      bestSeaQuality,
      waveHeightRange,
      bestWindow,
      reasonCodes: bestWindowReasonCodes,
    });
  }

  return summaries;
}

/**
 * Master Generic Forecast Normalizer: converts raw Open-Meteo response (and optional marine forecast) into a fully normalized SpotForecast.
 */
export function normalizeSpotForecastGeneric(
  spotConfig: RegionSpotConfig,
  raw: OpenMeteoRawResponse,
  currentTime = new Date(),
  timeZone = "Europe/Athens",
  regimeIdOrHourlyRegimes?: string | (string | undefined)[],
  marineForecast?: MarineForecast | null
): SpotForecast {
  const hourlyData = raw.hourly;
  const count = hourlyData.time.length;

  const marineByTimestamp = new Map<string, MarineForecastPoint>();
  if (marineForecast && marineForecast.points) {
    for (const mp of marineForecast.points) {
      marineByTimestamp.set(mp.timestamp, mp);
    }
  }

  const hourly: HourlyWind[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = hourlyData.time[i];
    const windSpeed = Math.max(0, hourlyData.wind_speed_10m[i] ?? 0);
    const windDirection = normalizeDegrees(hourlyData.wind_direction_10m[i] ?? 0);
    const windGust = Math.max(windSpeed, hourlyData.wind_gusts_10m[i] ?? windSpeed);
    const temperature = hourlyData.temperature_2m?.[i];
    const cloudCover = hourlyData.cloud_cover?.[i] ?? 0;
    const marinePoint = marineByTimestamp.get(timestamp) || null;

    const precipitationRaw = hourlyData.precipitation;
    let precipitation6hMm = 0;
    let precipitation12hMm = 0;

    if (precipitationRaw && precipitationRaw.length > 0) {
      // Sum past 6 hours and 12 hours up to index i
      const start6 = Math.max(0, i - 5);
      const start12 = Math.max(0, i - 11);
      for (let p = start6; p <= i; p++) {
        precipitation6hMm += precipitationRaw[p] ?? 0;
      }
      for (let p = start12; p <= i; p++) {
        precipitation12hMm += precipitationRaw[p] ?? 0;
      }
      precipitation6hMm = Math.round(precipitation6hMm * 10) / 10;
      precipitation12hMm = Math.round(precipitation12hMm * 10) / 10;
    }

    const pointRegimeId = Array.isArray(regimeIdOrHourlyRegimes)
      ? regimeIdOrHourlyRegimes[i]
      : regimeIdOrHourlyRegimes;

    let deltaHours = 1.0;
    const previousPoint = i > 0 ? hourly[i - 1] : undefined;
    if (previousPoint) {
      const diffMs = new Date(timestamp).getTime() - new Date(previousPoint.timestamp).getTime();
      if (diffMs > 0 && !isNaN(diffMs)) {
        deltaHours = diffMs / 3600000;
      }
    }

    const normalizedPoint = normalizeHourlyPoint(
      spotConfig,
      {
        timestamp,
        windSpeed,
        windGust,
        windDirection,
        temperature,
        cloudCover,
        precipitationPreviousHourMm: precipitationRaw?.[i] ?? 0,
        precipitation6hMm,
        precipitation12hMm,
        marine: marinePoint,
      },
      currentTime,
      pointRegimeId,
      timeZone,
      previousPoint,
      deltaHours
    );

    hourly.push(normalizedPoint);
  }

  let currentRegimeId: string | undefined = undefined;
  if (Array.isArray(regimeIdOrHourlyRegimes)) {
    const targetMs = currentTime.getTime();
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < count; i++) {
      const diff = Math.abs(new Date(hourlyData.time[i]).getTime() - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    currentRegimeId = regimeIdOrHourlyRegimes[closestIdx];
  } else {
    currentRegimeId = regimeIdOrHourlyRegimes;
  }

  const current = calculateCurrentConditionsGeneric(
    spotConfig,
    hourly,
    currentTime,
    timeZone,
    currentRegimeId
  );

  const days = calculateDailySummariesGeneric(hourly, spotConfig, timeZone, currentTime);

  return {
    spot: {
      id: spotConfig.id,
      name: spotConfig.name,
      subtitle: spotConfig.description,
      latitude: spotConfig.latitude,
      longitude: spotConfig.longitude,
      localCorrectionEnabled: true,
      operatingWindow: spotConfig.operatingWindow,
    },
    current,
    hourly,
    days,
    providerModel: raw.providerModel || "ECMWF IFS HRES (via Open-Meteo)",
  };
}

/**
 * Post-fusion renormalization helper for already-local wind observations (Bug 1 fix).
 *
 * Given an existing HourlyWind (pre-fusion) and corrected primitive values from the
 * ObservationFusionEngine, recalculates all derived quality scores, eligibility, water/lake state,
 * classification, and condition labels WITHOUT re-applying spot terrain correction factors
 * or thermal additive boosts (which are already reflected in the fused local values).
 *
 * @param spotConfig   The spot's regional configuration
 * @param baseHour     The pre-fusion HourlyWind snapshot
 * @param fusedWindKt  Corrected effective local wind speed in knots
 * @param fusedGustKt  Corrected effective local gust speed in knots
 * @param fusedDirDeg  Corrected wind direction in degrees (0–359)
 * @param regimeId     The regime ID active at this hour
 * @param timeZone     IANA timezone string for the region
 * @param referenceDate Optional reference date (defaults to baseHour timestamp)
 */
export function renormalizeHourWithObservation(
  spotConfig: RegionSpotConfig,
  baseHour: HourlyWind,
  fusedWindKt: number,
  fusedGustKt: number,
  fusedDirDeg: number,
  regimeId: string | undefined,
  timeZone = "Europe/Athens",
  referenceDate: Date = new Date(baseHour.timestamp)
): HourlyWind {
  const localWind = Math.max(0, fusedWindKt);
  const localGust = Math.max(localWind, fusedGustKt);
  const effectiveDegrees = (fusedDirDeg + 360) % 360;
  const effectiveDirection = degreesToCompass(effectiveDegrees);

  const directionScore = evaluateDirectionScore(spotConfig, effectiveDirection);

  const pointDate = new Date(baseHour.timestamp);
  const forecastHorizonHours = Math.max(
    0,
    (pointDate.getTime() - referenceDate.getTime()) / (1000 * 3600)
  );

  const { confidence, level: confidenceLevel } = evaluateForecastConfidence(
    forecastHorizonHours,
    directionScore,
    baseHour.modelWind
  );

  const gustScore = calculateGustinessScore(localWind, localGust);

  // Inland Lake State Model vs Offshore Marine Model
  let seaState: SeaStateEvaluation;
  let lakeStateSource = baseHour.lakeStateSource;

  if (spotConfig.lakeProfile) {
    seaState = evaluateLakeState(
      spotConfig,
      localWind,
      effectiveDirection,
      localGust
    );
    lakeStateSource = lakeStateSource || "LAKE_WIND_DERIVED";
  } else {
    const marinePoint: MarineForecastPoint | null =
      baseHour.seaState?.source === "MARINE_FORECAST"
        ? ({
            timestamp: baseHour.timestamp,
            waveHeight: baseHour.seaState.rawWaveHeight ?? baseHour.seaState.waveHeight ?? 0,
            wavePeriod: baseHour.seaState.wavePeriod ?? null,
            waveDirection: baseHour.seaState.waveDirection ?? null,
            provider: "ECMWF WAM",
          } as MarineForecastPoint)
        : null;

    seaState = evaluateSeaState(
      spotConfig,
      marinePoint,
      localWind,
      effectiveDirection
    );
  }

  const quality = evaluateHourQuality(
    spotConfig,
    localWind,
    localGust,
    effectiveDegrees,
    effectiveDirection,
    directionScore,
    seaState,
    gustScore,
    confidence,
    regimeId
  );

  const classification = getWindClassification(localWind);
  const condition = getConditionLabel(quality.sessionQualityScore);

  let updatedThermal = baseHour.thermal ? { ...baseHour.thermal } : undefined;
  if (updatedThermal && baseHour.observationFusion) {
    const fusion = baseHour.observationFusion;
    const fusionAdj = fusion.confidenceAdjustment || 0;
    const cov = fusion.coverage?.thermalContext ?? fusion.observationCoverage ?? 0;
    const combinedConf = Math.min(1.0, Math.max(0.0, updatedThermal.confidence + fusionAdj * cov));
    updatedThermal.confidence = Math.round(combinedConf * 100) / 100;
  }

  const reasonCodes = deriveHourlyReasonCodes(
    spotConfig,
    quality.eligibilityReason,
    updatedThermal,
    regimeId,
    baseHour.observationFusion
  );

  return {
    timestamp: baseHour.timestamp,
    modelWind: baseHour.modelWind,
    modelGust: baseHour.modelGust,
    localWind,
    localGust,
    correctionFactor: baseHour.correctionFactor,
    baseCorrectedWindKt: baseHour.baseCorrectedWindKt,
    preObservationLocalWindKt: baseHour.preObservationLocalWindKt,
    directionDegrees: effectiveDegrees,
    directionLabel: effectiveDirection,
    arrowRotation: compassToArrowRotation(effectiveDegrees),
    confidence: baseHour.confidence !== undefined ? baseHour.confidence : confidence,
    confidenceLevel: baseHour.confidenceLevel || confidenceLevel,
    eligibility: quality.eligibility,
    eligibilityReason: quality.eligibilityReason as any,
    hardGateReason: quality.eligibility === "UNSUITABLE" ? quality.eligibilityReason : undefined,
    reasonCodes,
    waterState: quality.waterState,
    seaState,
    lakeStateSource,
    precipitationPreviousHourMm: baseHour.precipitationPreviousHourMm,
    precipitation6hMm: baseHour.precipitation6hMm,
    precipitation12hMm: baseHour.precipitation12hMm,
    spotWindQuality: quality.spotWindQuality,
    directionQuality: quality.directionQuality,
    seaQualityScore: quality.seaQualityScore,
    waterStateQuality: quality.seaQualityScore,
    preferenceScore: quality.preferenceScore,
    sessionQualityScore: quality.sessionQualityScore,
    score: quality.sessionQualityScore,
    classification,
    condition,
    temperature: baseHour.temperature,
    cloudCover: baseHour.cloudCover,
    thermal: updatedThermal,
    regimeId: regimeId ?? baseHour.regimeId,
    observationFusion: baseHour.observationFusion,
  };
}

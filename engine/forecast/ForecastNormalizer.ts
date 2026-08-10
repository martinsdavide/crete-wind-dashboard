import { RegionSpotConfig } from "@/types/region";
import {
  DailyWindSummary,
  HourlyWind,
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
import { getSolarWindow } from "@/lib/solar";
import { findBestWindow } from "@/lib/bestWindow";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { evaluateHourQuality } from "../scoring/SessionQuality";
import {
  evaluateDirectionScore,
  evaluateForecastConfidence,
} from "../scoring/DirectionEvaluator";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";

/**
 * Circular angle interpolation from angleA to angleB by fraction t (0.0 - 1.0).
 */
export function interpolateAngle(angleA: number, angleB: number, t: number): number {
  const normA = normalizeDegrees(angleA);
  const normB = normalizeDegrees(angleB);
  let diff = (normB - normA) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normalizeDegrees(normA + diff * t);
}

/**
 * Calculates dynamic local correction factor using the spot's injected configuration and regional timezone.
 */
export function calculateLocalCorrectionFactor(
  spotConfig: RegionSpotConfig,
  timestamp: string | Date,
  directionLabel: WindDirection,
  directionDegrees: number,
  timeZone = "Europe/Athens"
): { factor: number; effectiveDirection: WindDirection; effectiveDegrees: number } {
  const cfg = spotConfig.localCorrection;
  let factor = cfg.baseCorrectionFactor;
  let effectiveDirection = directionLabel;
  let effectiveDegrees = directionDegrees;

  const { month, hour } = getLocalTimeComponents(timestamp, timeZone);

  // 1. Seasonal / Summer Boost
  if (cfg.summerBoostMonths && cfg.summerBoostMonths.includes(month)) {
    factor += cfg.summerBoostAmount ?? 0.10;
  }

  // 2. Diurnal / Afternoon Thermal Boost
  if (
    cfg.diurnalThermalBoost &&
    hour >= cfg.diurnalThermalBoost.startHour &&
    hour <= cfg.diurnalThermalBoost.endHour
  ) {
    factor += cfg.diurnalThermalBoost.boostAmount;
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
  };
}

/**
 * Estimates water state dynamically from spot configuration and wind intensity.
 */
export function estimateSpotWaterState(
  spotConfig: RegionSpotConfig,
  directionLabel: WindDirection,
  localWind: number
): WaterState {
  const styleRules = spotConfig.styleRules;

  if (styleRules) {
    const isFavoredDir =
      !styleRules.favoredDirections || styleRules.favoredDirections.includes(directionLabel);

    if (
      isFavoredDir &&
      styleRules.waveThresholdWind &&
      localWind >= styleRules.waveThresholdWind
    ) {
      return "WAVE";
    }

    if (
      isFavoredDir &&
      styleRules.bumpAndJumpThresholdWind &&
      localWind >= styleRules.bumpAndJumpThresholdWind
    ) {
      return "BUMP_AND_JUMP";
    }
  }

  if (localWind < 15) return "FLAT";
  if (localWind <= 22) return "CHOP";

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
  },
  referenceDate: Date = new Date(),
  regimeId?: string,
  timeZone = "Europe/Athens"
): HourlyWind {
  const rawDirectionLabel = degreesToCompass(point.windDirection);

  const { factor, effectiveDirection, effectiveDegrees } =
    calculateLocalCorrectionFactor(
      spotConfig,
      point.timestamp,
      rawDirectionLabel,
      point.windDirection,
      timeZone
    );

  const localWind = Math.max(0, point.windSpeed * factor);
  const localGust = Math.max(localWind, (point.windGust || point.windSpeed * 1.25) * factor);

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
  const waterState = estimateSpotWaterState(spotConfig, effectiveDirection, localWind);

  const quality = evaluateHourQuality(
    spotConfig,
    localWind,
    localGust,
    effectiveDegrees,
    effectiveDirection,
    directionScore,
    waterState,
    gustScore,
    confidence,
    regimeId
  );

  const classification = getWindClassification(localWind);
  const condition = getConditionLabel(quality.sessionQualityScore);

  return {
    timestamp: point.timestamp,
    modelWind: point.windSpeed,
    modelGust: point.windGust || point.windSpeed * 1.25,
    directionDegrees: effectiveDegrees,
    directionLabel: effectiveDirection,
    arrowRotation: compassToArrowRotation(effectiveDegrees),
    localWind,
    localGust,
    correctionFactor: factor,
    confidence,
    confidenceLevel,
    eligibility: quality.eligibility,
    eligibilityReason: quality.eligibilityReason as any,
    waterState: quality.waterState,
    spotWindQuality: quality.spotWindQuality,
    directionQuality: quality.directionQuality,
    preferenceScore: quality.preferenceScore,
    sessionQualityScore: quality.sessionQualityScore,
    score: quality.sessionQualityScore,
    classification,
    condition,
    temperature: point.temperature,
    cloudCover: point.cloudCover,
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

  return normalizeHourlyPoint(
    spotConfig,
    {
      timestamp: currentTime.toISOString(),
      windSpeed: modelWind,
      windGust: modelGust,
      windDirection: directionDegrees,
      temperature,
      cloudCover,
    },
    currentTime,
    regimeId,
    timeZone
  );
}

/**
 * Aggregates normalized hourly data into daily wind summaries using astronomical solar hours.
 */
export function calculateDailySummariesGeneric(
  hourly: HourlyWind[],
  spotConfig: RegionSpotConfig,
  timeZone = "Europe/Athens"
): DailyWindSummary[] {
  const groups: Record<string, HourlyWind[]> = {};

  for (const h of hourly) {
    const dateStr = h.timestamp.split("T")[0];
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(h);
  }

  const summaries: DailyWindSummary[] = [];

  for (const [dateStr, hours] of Object.entries(groups)) {
    if (hours.length === 0) continue;

    const dateObj = new Date(`${dateStr}T12:00:00.000Z`);
    const solar = getSolarWindow(dateObj, spotConfig.latitude, spotConfig.longitude);

    const daytimeHours = hours.filter((h) => {
      const { hour } = getLocalTimeComponents(h.timestamp, timeZone);
      return hour >= solar.startHour && hour < solar.endHour;
    });

    const activeHours = daytimeHours.length > 0 ? daytimeHours : hours;

    const windSpeeds = activeHours.map((h) => h.localWind);
    const gustSpeeds = activeHours.map((h) => h.localGust);
    const scores = activeHours.map((h) => h.sessionQualityScore);
    const dirDegrees = activeHours.map((h) => h.directionDegrees);

    const daytimeMinWind = Math.min(...windSpeeds);
    const daytimeMaxWind = Math.max(...windSpeeds);
    const minWind = Math.min(...hours.map((h) => h.localWind));
    const maxWind = Math.max(...hours.map((h) => h.localWind));
    const maxGust = Math.max(...gustSpeeds);

    const { degrees: dominantDirectionDegrees, label: dominantDirection } =
      getDominantDirection(dirDegrees);

    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

    const condition = getConditionLabel(avgScore);

    // Dominant eligibility
    const eligCounts: Record<string, number> = {};
    for (const h of activeHours) {
      eligCounts[h.eligibility] = (eligCounts[h.eligibility] || 0) + 1;
    }
    let dominantEligibility = activeHours[0].eligibility;
    let maxCount = 0;
    for (const [el, count] of Object.entries(eligCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantEligibility = el as any;
      }
    }

    // Dominant style
    const styleCounts: Record<string, number> = {};
    for (const h of activeHours) {
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

    // Find Best Window
    const bestWindow = findBestWindow(
      hours,
      SCORING_CONFIG.bestWindow?.minScoreThreshold ?? 70,
      SCORING_CONFIG.bestWindow?.minConsecutiveHours ?? 2
    );

    summaries.push({
      date: dateStr,
      minWind,
      maxWind,
      daytimeMinWind,
      daytimeMaxWind,
      maxGust,
      dominantDirection,
      dominantDirectionDegrees,
      score: avgScore,
      condition,
      dominantEligibility,
      dominantStyle,
      bestWindow,
    });
  }

  return summaries;
}

/**
 * Master Generic Forecast Normalizer: converts raw Open-Meteo response into a fully normalized SpotForecast.
 */
export function normalizeSpotForecastGeneric(
  spotConfig: RegionSpotConfig,
  raw: OpenMeteoRawResponse,
  currentTime = new Date(),
  timeZone = "Europe/Athens",
  regimeId?: string
): SpotForecast {
  const hourlyData = raw.hourly;
  const count = hourlyData.time.length;

  const hourly: HourlyWind[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = hourlyData.time[i];
    const windSpeed = Math.max(0, hourlyData.wind_speed_10m[i] ?? 0);
    const windDirection = normalizeDegrees(hourlyData.wind_direction_10m[i] ?? 0);
    const windGust = Math.max(windSpeed, hourlyData.wind_gusts_10m[i] ?? windSpeed);
    const temperature = hourlyData.temperature_2m?.[i];
    const cloudCover = hourlyData.cloud_cover?.[i] ?? 0;

    const normalizedPoint = normalizeHourlyPoint(
      spotConfig,
      {
        timestamp,
        windSpeed,
        windGust,
        windDirection,
        temperature,
        cloudCover,
      },
      currentTime,
      regimeId,
      timeZone
    );

    hourly.push(normalizedPoint);
  }

  const current = calculateCurrentConditionsGeneric(
    spotConfig,
    hourly,
    currentTime,
    timeZone,
    regimeId
  );

  const days = calculateDailySummariesGeneric(hourly, spotConfig, timeZone);

  return {
    spot: {
      id: spotConfig.id,
      name: spotConfig.name,
      subtitle: spotConfig.description,
      latitude: spotConfig.latitude,
      longitude: spotConfig.longitude,
      localCorrectionEnabled: true,
    },
    current,
    hourly,
    days,
    providerModel: raw.providerModel || "ECMWF IFS HRES (via Open-Meteo)",
  };
}

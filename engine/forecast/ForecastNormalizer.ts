import { RegionSpotConfig, ThermalEvaluation } from "@/types/region";
import {
  DailyWindSummary,
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
import { getSolarWindow } from "@/lib/solar";
import { findBestWindow } from "@/lib/bestWindow";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { evaluateHourQuality } from "../scoring/SessionQuality";
import {
  evaluateDirectionScore,
  evaluateForecastConfidence,
} from "../scoring/DirectionEvaluator";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { evaluateSeaState } from "../marine/SeaStateEvaluator";
import { MarineForecast, MarineForecastPoint, SeaStateEvaluation } from "@/types/marine";

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
export function calculateThermalStrength(
  spotConfig: RegionSpotConfig,
  timestamp: string | Date,
  directionLabel: WindDirection,
  modelWind = 12,
  cloudCover = 0,
  timeZone = "Europe/Athens"
): ThermalEvaluation {
  const cfg = spotConfig.localCorrection.diurnalThermalBoost;

  if (!cfg || cfg.enabled === false) {
    return {
      strength: 0,
      boost: 0,
      active: false,
      factors: { season: 1, time: 0, direction: 1, synopticWind: 1, solar: 1 },
    };
  }

  const { month, hour } = getLocalTimeComponents(timestamp, timeZone);

  // Backward-compatible FIXED model
  if (!("model" in cfg) || cfg.model !== "DYNAMIC") {
    const isHourActive = hour >= cfg.startHour && hour <= cfg.endHour;
    return {
      strength: isHourActive ? 1.0 : 0,
      boost: isHourActive ? cfg.boostAmount : 0,
      active: isHourActive,
      factors: { season: 1, time: isHourActive ? 1 : 0, direction: 1, synopticWind: 1, solar: 1 },
    };
  }

  // DYNAMIC multi-factor thermal model
  // 1. Season Factor
  let seasonFactor = 1.0;
  if (cfg.monthFactors) {
    seasonFactor = cfg.monthFactors[month] ?? 0.0;
  }

  // 2. Time-of-Day Factor
  let timeFactor = 0.0;
  if (cfg.timeProfile && cfg.timeProfile.length > 0) {
    const firstH = cfg.timeProfile[0].hour;
    const lastH = cfg.timeProfile[cfg.timeProfile.length - 1].hour;
    if (hour >= firstH && hour <= lastH) {
      timeFactor = interpolateCurve(
        hour,
        cfg.timeProfile.map((p) => ({ x: p.hour, y: p.factor }))
      );
    } else {
      timeFactor = 0.0;
    }
  } else {
    timeFactor = 1.0;
  }

  // 3. Direction Factor
  let directionFactor = 1.0;
  if (cfg.directionFactors) {
    directionFactor =
      cfg.directionFactors[directionLabel] ?? cfg.defaultDirectionFactor ?? 0.10;
  }

  // 4. Synoptic Wind Factor
  let synopticWindFactor = 1.0;
  if (cfg.synopticWindCurve && cfg.synopticWindCurve.length > 0) {
    synopticWindFactor = interpolateCurve(
      modelWind,
      cfg.synopticWindCurve.map((p) => ({ x: p.wind, y: p.factor }))
    );
  }

  // 5. Solar / Cloud Cover Factor
  let solarFactor = 1.0;
  const effectiveCloud = cloudCover !== undefined && !isNaN(cloudCover) ? cloudCover : 0;
  if (cfg.cloudCoverCurve && cfg.cloudCoverCurve.length > 0) {
    solarFactor = interpolateCurve(
      effectiveCloud,
      cfg.cloudCoverCurve.map((p) => ({ x: p.cloud, y: p.factor }))
    );
  } else {
    solarFactor = Math.max(0, 1.0 - effectiveCloud / 100);
  }

  // Multiply all factors
  const rawStrength =
    seasonFactor * timeFactor * directionFactor * synopticWindFactor * solarFactor;
  let strength = Math.max(0, Math.min(1, rawStrength));

  const minStrength = cfg.minThermalStrength ?? 0.05;
  if (strength < minStrength) {
    strength = 0;
  }

  const boost = cfg.maxBoost * strength;
  const active = strength > 0 && boost > 0;

  return {
    strength,
    boost,
    active,
    factors: {
      season: seasonFactor,
      time: timeFactor,
      direction: directionFactor,
      synopticWind: synopticWindFactor,
      solar: solarFactor,
    },
  };
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
  timeZone = "Europe/Athens"
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

  const { month } = getLocalTimeComponents(timestamp, timeZone);

  // 1. Seasonal / Summer Boost (applied only if not configured with dynamic thermal)
  const isDynamicThermal =
    cfg.diurnalThermalBoost &&
    "model" in cfg.diurnalThermalBoost &&
    cfg.diurnalThermalBoost.model === "DYNAMIC";

  if (!isDynamicThermal && cfg.summerBoostMonths && cfg.summerBoostMonths.includes(month)) {
    factor += cfg.summerBoostAmount ?? 0.10;
  }

  // 2. Diurnal Thermal Boost (evaluated via calculateThermalStrength)
  const thermal = calculateThermalStrength(
    spotConfig,
    timestamp,
    directionLabel,
    modelWind,
    cloudCover,
    timeZone
  );

  if (thermal.active) {
    factor += thermal.boost;
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
    marine?: MarineForecastPoint | null;
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
      point.windSpeed,
      point.cloudCover,
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

  // Independent Sea State Model Evaluation
  const seaState: SeaStateEvaluation = evaluateSeaState(
    spotConfig,
    point.marine,
    localWind,
    effectiveDirection
  );

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
    seaState,
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

  // Interpolate marine wave metrics if present
  let marinePoint: MarineForecastPoint | null = null;
  if (prev.seaState && next.seaState && prev.seaState.waveHeight !== null && next.seaState.waveHeight !== null) {
    const waveHeight = prev.seaState.waveHeight + t * (next.seaState.waveHeight - prev.seaState.waveHeight);
    const wavePeriod =
      prev.seaState.wavePeriod !== null && next.seaState.wavePeriod !== null
        ? prev.seaState.wavePeriod + t * (next.seaState.wavePeriod - prev.seaState.wavePeriod)
        : prev.seaState.wavePeriod;
    const waveDirection =
      prev.seaState.waveDirection !== null && next.seaState.waveDirection !== null
        ? interpolateAngle(prev.seaState.waveDirection, next.seaState.waveDirection, t)
        : prev.seaState.waveDirection;

    marinePoint = {
      timestamp: currentTime.toISOString(),
      waveHeight,
      wavePeriod,
      waveDirection,
      provider: prev.seaState.source,
    };
  }

  return normalizeHourlyPoint(
    spotConfig,
    {
      timestamp: currentTime.toISOString(),
      windSpeed: modelWind,
      windGust: modelGust,
      windDirection: directionDegrees,
      temperature,
      cloudCover,
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
      timeZone: timeZone || "Europe/Athens",
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
  timeZone = "Europe/Athens"
): DailyWindSummary[] {
  const groups: Record<string, HourlyWind[]> = {};

  for (const h of hourly) {
    const dateKey = getRegionalDateKey(h.timestamp, timeZone);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(h);
  }

  const summaries: DailyWindSummary[] = [];

  for (const [dateStr, hours] of Object.entries(groups)) {
    if (hours.length === 0) continue;

    const noonDate = new Date(`${dateStr}T12:00:00.000Z`);
    const solarWindow = getSolarWindow(
      noonDate,
      spotConfig.latitude,
      spotConfig.longitude,
      timeZone
    );

    const activeHours = hours.filter((h) => {
      const { hour } = getLocalTimeComponents(h.timestamp, timeZone);
      return hour >= solarWindow.startHour && hour < solarWindow.endHour;
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
      SCORING_CONFIG.bestWindow?.minScoreThreshold ?? 70,
      SCORING_CONFIG.bestWindow?.minConsecutiveHours ?? 2,
      timeZone,
      spotConfig.latitude,
      spotConfig.longitude
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
      score: dailyScore,
      condition,
      dominantEligibility,
      dominantStyle,
      dominantSeaState: dominantStyle,
      bestSeaQuality,
      waveHeightRange,
      bestWindow,
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
  regimeId?: string,
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

    const normalizedPoint = normalizeHourlyPoint(
      spotConfig,
      {
        timestamp,
        windSpeed,
        windGust,
        windDirection,
        temperature,
        cloudCover,
        marine: marinePoint,
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

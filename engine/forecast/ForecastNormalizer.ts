import { RegionSpotConfig } from "@/types/region";
import { degreesToCompass, compassToArrowRotation } from "@/lib/windDirection";
import { getWindClassification, getConditionLabel, calculateGustinessScore } from "@/lib/windScore";
import { getLocalTimeComponents } from "@/lib/localWind";
import { HourlyWind, WaterState, WindDirection } from "@/types/weather";
import { evaluateHourQuality } from "../scoring/SessionQuality";
import { evaluateDirectionScore, evaluateForecastConfidence } from "../scoring/DirectionEvaluator";

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

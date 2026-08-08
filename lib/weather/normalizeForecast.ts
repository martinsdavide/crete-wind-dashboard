import { HourlyWind, SpotForecast } from "@/types/weather";
import { SpotConfig } from "@/types/spot";
import { OpenMeteoRawResponse } from "./openMeteo";
import {
  compassToArrowRotation,
  degreesToCompass,
  normalizeDegrees,
} from "../windDirection";
import { calculateLocalGust, calculateLocalWind } from "../localWind";
import {
  calculateDirectionScore,
  calculateForecastConfidence,
  calculateGustinessScore,
  calculateOverallWindScore,
  calculateWindStrengthScore,
  getConditionLabel,
  getWindClassification,
} from "../windScore";
import { calculateDailySummaries } from "../dailySummary";

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
 * Converts a raw Open-Meteo response into a strongly-typed, normalized SpotForecast.
 */
export function normalizeSpotForecast(
  spot: SpotConfig,
  raw: OpenMeteoRawResponse,
  currentTime = new Date()
): SpotForecast {
  const hourlyData = raw.hourly;
  const count = hourlyData.time.length;
  const referenceTimeMs = currentTime.getTime();

  const hourly: HourlyWind[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = hourlyData.time[i];
    const itemDate = new Date(timestamp);
    const itemMs = itemDate.getTime();
    
    // Forecast horizon in hours relative to current time
    const horizonHours = Math.max(0, (itemMs - referenceTimeMs) / (1000 * 60 * 60));

    const modelWind = Math.max(0, hourlyData.wind_speed_10m[i] ?? 0);
    const directionDegrees = normalizeDegrees(hourlyData.wind_direction_10m[i] ?? 0);
    const modelGust = Math.max(
      modelWind,
      hourlyData.wind_gusts_10m[i] ?? modelWind
    );
    const temperature = hourlyData.temperature_2m?.[i];
    const cloudCover = hourlyData.cloud_cover?.[i] ?? 0;

    const directionLabel = degreesToCompass(directionDegrees);
    const arrowRotation = compassToArrowRotation(directionDegrees);

    // 1. Local Wind Correction
    const localWindResult = calculateLocalWind(
      spot.id,
      modelWind,
      directionDegrees,
      timestamp,
      cloudCover
    );

    const localWind = localWindResult.localWind;
    const correctionFactor = localWindResult.correctionFactor;

    // 2. Local Gust Calculation
    const localGust = calculateLocalGust(modelGust, localWind, modelWind);

    // 3. Scoring & Confidence
    const strengthScore = calculateWindStrengthScore(localWind);
    const directionScore = calculateDirectionScore(spot.id, directionLabel);
    const gustScore = calculateGustinessScore(localWind, localGust);
    const { confidence, level: confidenceLevel } = calculateForecastConfidence(
      horizonHours,
      spot.id,
      directionLabel,
      modelWind
    );

    const score = calculateOverallWindScore(
      strengthScore,
      directionScore,
      gustScore,
      confidence
    );

    const classification = getWindClassification(localWind);
    const condition = getConditionLabel(score);

    hourly.push({
      timestamp,
      modelWind,
      modelGust,
      directionDegrees,
      directionLabel,
      arrowRotation,
      localWind,
      localGust,
      correctionFactor,
      confidence,
      confidenceLevel,
      score,
      classification,
      condition,
      temperature,
      cloudCover,
    });
  }

  // 4. Calculate Current "NOW" Conditions via Linear Interpolation
  const current = calculateCurrentConditions(spot, hourly, currentTime);

  // 5. Calculate Daily Summaries
  const days = calculateDailySummaries(hourly);

  return {
    spot,
    current,
    hourly,
    days,
  };
}

/**
 * Calculates current "NOW" conditions by linear interpolation between the two nearest hourly forecast points.
 */
export function calculateCurrentConditions(
  spot: SpotConfig,
  hourly: HourlyWind[],
  currentTime = new Date()
): HourlyWind {
  if (hourly.length === 0) {
    throw new Error("No hourly data available for current condition estimation");
  }

  const targetMs = currentTime.getTime();

  // Find index of first item >= targetMs
  let nextIdx = hourly.findIndex((h) => new Date(h.timestamp).getTime() >= targetMs);

  if (nextIdx <= 0) {
    // Before or at first point
    return { ...hourly[0] };
  }

  if (nextIdx === -1) {
    // After all points
    return { ...hourly[hourly.length - 1] };
  }

  const prevIdx = nextIdx - 1;
  const prev = hourly[prevIdx];
  const next = hourly[nextIdx];

  const prevMs = new Date(prev.timestamp).getTime();
  const nextMs = new Date(next.timestamp).getTime();
  const span = nextMs - prevMs;

  const t = span > 0 ? Math.max(0, Math.min(1, (targetMs - prevMs) / span)) : 0;

  // Linear interpolation for continuous variables
  const modelWind = prev.modelWind + t * (next.modelWind - prev.modelWind);
  const modelGust = prev.modelGust + t * (next.modelGust - prev.modelGust);
  const directionDegrees = interpolateAngle(
    prev.directionDegrees,
    next.directionDegrees,
    t
  );
  const cloudCover =
    prev.cloudCover !== undefined && next.cloudCover !== undefined
      ? prev.cloudCover + t * (next.cloudCover - prev.cloudCover)
      : prev.cloudCover;

  const temperature =
    prev.temperature !== undefined && next.temperature !== undefined
      ? prev.temperature + t * (next.temperature - prev.temperature)
      : prev.temperature;

  const directionLabel = degreesToCompass(directionDegrees);
  const arrowRotation = compassToArrowRotation(directionDegrees);

  const localWindResult = calculateLocalWind(
    spot.id,
    modelWind,
    directionDegrees,
    currentTime,
    cloudCover
  );

  const localWind = localWindResult.localWind;
  const correctionFactor = localWindResult.correctionFactor;
  const localGust = calculateLocalGust(modelGust, localWind, modelWind);

  const strengthScore = calculateWindStrengthScore(localWind);
  const directionScore = calculateDirectionScore(spot.id, directionLabel);
  const gustScore = calculateGustinessScore(localWind, localGust);
  const { confidence, level: confidenceLevel } = calculateForecastConfidence(
    0, // NOW horizon is 0h
    spot.id,
    directionLabel,
    modelWind
  );

  const score = calculateOverallWindScore(
    strengthScore,
    directionScore,
    gustScore,
    confidence
  );

  return {
    timestamp: currentTime.toISOString(),
    modelWind,
    modelGust,
    directionDegrees,
    directionLabel,
    arrowRotation,
    localWind,
    localGust,
    correctionFactor,
    confidence,
    confidenceLevel,
    score,
    classification: getWindClassification(localWind),
    condition: getConditionLabel(score),
    temperature,
    cloudCover,
  };
}

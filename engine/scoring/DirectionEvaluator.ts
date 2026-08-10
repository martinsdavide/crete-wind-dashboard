import { RegionSpotConfig } from "@/types/region";
import { ForecastConfidenceLevel, WindDirection } from "@/types/weather";
import { SCORING_CONFIG } from "@/config/windProfiles";

/**
 * Calculates spot-specific direction score (0-100) driven purely by configuration.
 */
export function evaluateDirectionScore(
  spotConfig: RegionSpotConfig,
  directionLabel: WindDirection
): number {
  if (spotConfig.directionScores) {
    return (
      spotConfig.directionScores[directionLabel] ??
      spotConfig.directionScores.default ??
      50
    );
  }

  if (spotConfig.idealDirections.includes(directionLabel)) {
    return 100;
  }

  return 40;
}

/**
 * Calculates forecast confidence (0-100) and qualitative level (HIGH/MEDIUM/LOW)
 * driven purely by horizon, direction quality, and wind strength without spot assumptions.
 */
export function evaluateForecastConfidence(
  forecastHorizonHours: number,
  directionScore: number,
  modelWind: number
): { confidence: number; level: ForecastConfidenceLevel } {
  let score = SCORING_CONFIG.confidence.baseline; // 80

  // Horizon adjustment
  if (forecastHorizonHours <= 24) {
    score += SCORING_CONFIG.confidence.horizonUnder24h; // +5
  } else if (forecastHorizonHours > 72) {
    score += SCORING_CONFIG.confidence.horizonOver72h; // -15
  } else if (forecastHorizonHours > 48) {
    score += SCORING_CONFIG.confidence.horizonOver48h; // -10
  }

  // Direction favorability
  if (directionScore >= 80) {
    score += SCORING_CONFIG.confidence.favorableDirection; // +5
  } else {
    score += SCORING_CONFIG.confidence.nonTypicalDirection; // -10
  }

  // Model wind strength
  if (modelWind > 15) {
    score += SCORING_CONFIG.confidence.windOver15kt; // +5
  } else if (modelWind < 10) {
    score += SCORING_CONFIG.confidence.windUnder10kt; // -10
  }

  // Clamp 0 - 100
  const confidence = Math.max(0, Math.min(100, Math.round(score)));

  let level: ForecastConfidenceLevel = "MEDIUM";
  if (confidence >= 80) {
    level = "HIGH";
  } else if (confidence < 60) {
    level = "LOW";
  }

  return { confidence, level };
}

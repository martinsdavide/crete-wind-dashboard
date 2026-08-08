import {
  ConditionLabel,
  ForecastConfidenceLevel,
  WindClassification,
  WindDirection,
} from "@/types/weather";
import { SCORING_CONFIG, SPOT_PROFILES } from "@/config/windProfiles";

/**
 * Calculates wind strength score (0-100) using piecewise linear interpolation.
 */
export function calculateWindStrengthScore(localWind: number): number {
  if (isNaN(localWind) || localWind <= 0) return 0;
  if (localWind < 12) {
    // Smooth ramp up to 20 at 12 kt
    return (localWind / 12) * 20;
  }
  if (localWind >= 12 && localWind < 15) {
    // 12 -> 20, 15 -> 50
    return 20 + ((localWind - 12) / (15 - 12)) * (50 - 20);
  }
  if (localWind >= 15 && localWind < 18) {
    // 15 -> 50, 18 -> 80
    return 50 + ((localWind - 15) / (18 - 15)) * (80 - 50);
  }
  if (localWind >= 18 && localWind < 22) {
    // 18 -> 80, 22 -> 100
    return 80 + ((localWind - 18) / (22 - 18)) * (100 - 80);
  }
  if (localWind >= 22 && localWind <= 28) {
    // Prime sweet spot
    return 100;
  }
  if (localWind > 28 && localWind < 32) {
    // 28 -> 100, 32 -> 70 (or 28 -> 90)
    return 100 - ((localWind - 28) / (32 - 28)) * (100 - 70);
  }
  if (localWind >= 32 && localWind < 36) {
    // 32 -> 70, 36 -> 40
    return 70 - ((localWind - 32) / (36 - 32)) * (70 - 40);
  }
  // >= 36 kt
  const drop = Math.max(0, 40 - (localWind - 36) * 2);
  return Math.min(40, drop);
}

/**
 * Calculates spot-specific direction score (0-100).
 */
export function calculateDirectionScore(
  spotId: "kouremenos" | "tenda",
  directionLabel: WindDirection
): number {
  const profile = SPOT_PROFILES[spotId];
  return profile.directionScores[directionLabel] ?? profile.directionScores.default;
}

/**
 * Calculates gustiness score (0-100) based on ratio localGust / localWind.
 */
export function calculateGustinessScore(localWind: number, localGust: number): number {
  if (isNaN(localWind) || localWind <= 0) return 100;
  const safeGust = isNaN(localGust) || localGust < localWind ? localWind : localGust;
  const ratio = safeGust / localWind;

  if (ratio < 1.20) return 100;
  if (ratio < 1.30) return 90;
  if (ratio < 1.45) return 70;
  return 40;
}

/**
 * Calculates forecast confidence (0-100) and qualitative level (HIGH/MEDIUM/LOW).
 */
export function calculateForecastConfidence(
  forecastHorizonHours: number,
  spotId: "kouremenos" | "tenda",
  directionLabel: WindDirection,
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
  const dirScore = calculateDirectionScore(spotId, directionLabel);
  if (dirScore >= 80) {
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

/**
 * Calculates total hourly windsurf score (0-100).
 */
export function calculateOverallWindScore(
  strengthScore: number,
  directionScore: number,
  gustScore: number,
  confidenceScore: number
): number {
  const w = SCORING_CONFIG.weights;
  const rawScore =
    strengthScore * w.windStrength +
    directionScore * w.direction +
    gustScore * w.gustiness +
    confidenceScore * w.confidence;

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

/**
 * Categorizes local wind speed into human-friendly classifications.
 */
export function getWindClassification(localWind: number): WindClassification {
  if (localWind < 12) return "LOW";
  if (localWind < 17) return "LIGHT";
  if (localWind < 22) return "GOOD";
  if (localWind < 28) return "GREAT";
  if (localWind < 34) return "STRONG";
  return "VERY STRONG";
}

/**
 * Maps a 0-100 windsurf score to an overall condition label.
 */
export function getConditionLabel(score: number): ConditionLabel {
  if (score < 40) return "POOR";
  if (score < 60) return "OK";
  if (score < 75) return "GOOD";
  if (score < 90) return "VERY GOOD";
  return "EXCELLENT";
}

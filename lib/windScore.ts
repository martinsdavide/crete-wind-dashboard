import {
  ConditionLabel,
  ForecastConfidenceLevel,
  WindClassification,
  WindDirection,
} from "@/types/weather";
import { SpotId } from "@/types/spot";
import { SCORING_CONFIG, SPOT_PROFILES } from "@/config/windProfiles";

/**
 * Calculates wind strength score (0-100) using generic piecewise linear interpolation
 * directly over the configured thresholds in SCORING_CONFIG.
 */
export function calculateWindStrengthScore(
  localWind: number,
  thresholds = SCORING_CONFIG.windStrengthThresholds
): number {
  if (isNaN(localWind) || localWind <= 0) return 0;
  if (!thresholds || thresholds.length === 0) return 0;

  // Below first threshold
  if (localWind <= thresholds[0].wind) {
    return thresholds[0].score;
  }

  const last = thresholds[thresholds.length - 1];
  // Above last threshold (e.g. > 36 kt)
  if (localWind >= last.wind) {
    const drop = Math.max(0, last.score - (localWind - last.wind) * 2);
    return Math.min(last.score, drop);
  }

  // Piecewise linear interpolation between adjacent configured points
  for (let i = 0; i < thresholds.length - 1; i++) {
    const t1 = thresholds[i];
    const t2 = thresholds[i + 1];

    if (localWind >= t1.wind && localWind <= t2.wind) {
      const span = t2.wind - t1.wind;
      if (span === 0) return t1.score;
      const fraction = (localWind - t1.wind) / span;
      return t1.score + fraction * (t2.score - t1.score);
    }
  }

  return 0;
}

/**
 * Calculates spot-specific direction score (0-100).
 */
export function calculateDirectionScore(
  spotId: SpotId,
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
  spotId: SpotId,
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

import { HourlyWind, WindowStability, GustinessLabel, StabilityLabel } from "@/types/weather";
import { degreesToCompass } from "./windDirection";
import { SCORING_CONFIG } from "@/config/windProfiles";

/**
 * Computes min, max, mean, and sample standard deviation of wind speeds.
 */
export function calculateWindStatistics(winds: number[]): {
  minWind: number;
  maxWind: number;
  meanWind: number;
  windStdDev: number;
  windStabilityLabel: StabilityLabel;
} {
  if (winds.length === 0) {
    return {
      minWind: 0,
      maxWind: 0,
      meanWind: 0,
      windStdDev: 0,
      windStabilityLabel: "Very Stable",
    };
  }

  const minWind = Math.min(...winds);
  const maxWind = Math.max(...winds);
  const sum = winds.reduce((acc, v) => acc + v, 0);
  const meanWind = sum / winds.length;

  let windStdDev = 0;
  if (winds.length > 1) {
    const variance =
      winds.reduce((acc, v) => acc + Math.pow(v - meanWind, 2), 0) /
      (winds.length - 1);
    windStdDev = Math.sqrt(variance);
  }

  let windStabilityLabel: StabilityLabel = "Very Stable";
  if (windStdDev > 4.5) {
    windStabilityLabel = "Highly Variable";
  } else if (windStdDev > 2.5) {
    windStabilityLabel = "Variable";
  } else if (windStdDev > 1.0) {
    windStabilityLabel = "Stable";
  } else {
    windStabilityLabel = "Very Stable";
  }

  return {
    minWind: Math.round(minWind * 10) / 10,
    maxWind: Math.round(maxWind * 10) / 10,
    meanWind: Math.round(meanWind * 10) / 10,
    windStdDev: Math.round(windStdDev * 10) / 10,
    windStabilityLabel,
  };
}

/**
 * Computes circular statistics (mean angle, circular standard deviation, circular range, labels).
 * Strictly avoids linear arithmetic to handle angle wrap-around (e.g., 359° and 1° -> mean 0°, range 2°).
 */
export function calculateCircularDirectionStatistics(directions: number[]): {
  meanDirection: number;
  directionStdDev: number;
  directionRange: number;
  startDirectionLabel: string;
  endDirectionLabel: string;
  directionRangeLabel: string;
  directionStabilityLabel: StabilityLabel;
} {
  if (directions.length === 0) {
    return {
      meanDirection: 0,
      directionStdDev: 0,
      directionRange: 0,
      startDirectionLabel: "N",
      endDirectionLabel: "N",
      directionRangeLabel: "N",
      directionStabilityLabel: "Very Stable",
    };
  }

  let sinSum = 0;
  let cosSum = 0;

  for (const deg of directions) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }

  const n = directions.length;
  const meanRad = Math.atan2(sinSum, cosSum);
  const meanDirection = (meanRad * (180 / Math.PI) + 360) % 360;

  // Mean resultant vector length R (bounded [0, 1])
  const R = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / n;

  // Circular angular dispersion / standard deviation (degrees)
  let directionStdDev = 0;
  if (R < 0.999999) {
    // Mardia & Jupp circular standard deviation
    const rBounded = Math.max(0.0001, Math.min(1, R));
    directionStdDev = Math.sqrt(-2 * Math.log(rBounded)) * (180 / Math.PI);
  }

  // Calculate circular range relative to circular mean
  const relativeOffsets = directions.map((deg) => {
    let diff = (deg - meanDirection) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  });

  const minOffset = Math.min(...relativeOffsets);
  const maxOffset = Math.max(...relativeOffsets);
  const directionRange = Math.min(360, maxOffset - minOffset);

  const startAngle = (meanDirection + minOffset + 360) % 360;
  const endAngle = (meanDirection + maxOffset + 360) % 360;

  const startDirectionLabel = degreesToCompass(startAngle);
  const endDirectionLabel = degreesToCompass(endAngle);

  const directionRangeLabel =
    startDirectionLabel === endDirectionLabel
      ? startDirectionLabel
      : `${startDirectionLabel} → ${endDirectionLabel}`;

  let directionStabilityLabel: StabilityLabel = "Very Stable";
  if (directionStdDev > 25.0) {
    directionStabilityLabel = "Highly Variable";
  } else if (directionStdDev > 12.0) {
    directionStabilityLabel = "Variable";
  } else if (directionStdDev > 5.0) {
    directionStabilityLabel = "Stable";
  } else {
    directionStabilityLabel = "Very Stable";
  }

  return {
    meanDirection: Math.round(meanDirection * 10) / 10,
    directionStdDev: Math.round(directionStdDev * 10) / 10,
    directionRange: Math.round(directionRange * 10) / 10,
    startDirectionLabel,
    endDirectionLabel,
    directionRangeLabel,
    directionStabilityLabel,
  };
}

/**
 * Computes gust factor (meanGust / meanWind) and classifies gustiness.
 */
export function calculateGustiness(
  winds: number[],
  gusts: number[]
): {
  gustFactor: number;
  gustinessLabel: GustinessLabel;
} {
  const tiers = SCORING_CONFIG.stability.gustTiers;

  if (winds.length === 0) {
    return {
      gustFactor: 1.0,
      gustinessLabel: "Smooth",
    };
  }

  const sumWind = winds.reduce((acc, v) => acc + v, 0);
  const sumGust = gusts.reduce((acc, v) => acc + v, 0);

  const meanWind = sumWind / winds.length;
  const meanGust = sumGust / (gusts.length || 1);

  const gustFactor = meanWind > 0 ? meanGust / meanWind : 1.0;
  const roundedGustFactor = Math.round(gustFactor * 100) / 100;

  let gustinessLabel: GustinessLabel = "Smooth";
  if (roundedGustFactor > tiers.gustyMax) {
    gustinessLabel = "Very Gusty";
  } else if (roundedGustFactor > tiers.slightlyGustyMax) {
    gustinessLabel = "Gusty";
  } else if (roundedGustFactor > tiers.smoothMax) {
    gustinessLabel = "Slightly Gusty";
  } else {
    gustinessLabel = "Smooth";
  }

  return {
    gustFactor: roundedGustFactor,
    gustinessLabel,
  };
}

/**
 * Computes overall Stability Score (0-100) from wind stdDev, direction stdDev, and gust factor.
 */
export function calculateStabilityScore(
  windStdDev: number,
  directionStdDev: number,
  gustFactor: number
): number {
  const { weights } = SCORING_CONFIG.stability;

  // 1. Wind stability sub-score: 0 kt -> 100, 1.0 kt -> 88, 2.5 kt -> 69, 5 kt -> 38, >= 8 kt -> 0
  const windScore = Math.max(0, Math.min(100, 100 - windStdDev * 12.5));

  // 2. Direction stability sub-score: 0° -> 100, 5° -> 90, 15° -> 70, 30° -> 40, >= 50° -> 0
  const dirScore = Math.max(0, Math.min(100, 100 - directionStdDev * 2.0));

  // 3. Gust factor sub-score: 1.00 -> 100, 1.10 -> 84, 1.25 -> 60, 1.35 -> 44, >= 1.60 -> 0
  const excessGust = Math.max(0, gustFactor - 1.0);
  const gustScore = Math.max(0, Math.min(100, 100 - excessGust * 160));

  const composite =
    weights.windStability * windScore +
    weights.directionStability * dirScore +
    weights.gustQuality * gustScore;

  return Math.max(0, Math.min(100, Math.round(composite)));
}

/**
 * Computes Recommendation Confidence from Stability Score.
 */
export function calculateConfidence(
  stabilityScore: number
): "LOW" | "MEDIUM" | "HIGH" {
  const { confidenceTiers } = SCORING_CONFIG.stability;

  if (stabilityScore >= confidenceTiers.high) {
    return "HIGH";
  }
  if (stabilityScore >= confidenceTiers.medium) {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Master function to analyze the Best Window hours and compute WindowStability.
 */
export function calculateWindowStability(
  windowHours: HourlyWind[]
): WindowStability | null {
  if (!windowHours || windowHours.length === 0) {
    return null;
  }

  const winds = windowHours.map((h) => h.localWind);
  const gusts = windowHours.map((h) => h.localGust);
  const directions = windowHours.map((h) => h.directionDegrees);

  const windStats = calculateWindStatistics(winds);
  const dirStats = calculateCircularDirectionStatistics(directions);
  const gustStats = calculateGustiness(winds, gusts);

  const stabilityScore = calculateStabilityScore(
    windStats.windStdDev,
    dirStats.directionStdDev,
    gustStats.gustFactor
  );

  const confidence = calculateConfidence(stabilityScore);

  return {
    minWind: windStats.minWind,
    maxWind: windStats.maxWind,
    meanWind: windStats.meanWind,
    windStdDev: windStats.windStdDev,

    meanDirection: dirStats.meanDirection,
    directionStdDev: dirStats.directionStdDev,
    directionRange: dirStats.directionRange,

    startDirectionLabel: dirStats.startDirectionLabel,
    endDirectionLabel: dirStats.endDirectionLabel,
    directionRangeLabel: dirStats.directionRangeLabel,

    gustFactor: gustStats.gustFactor,
    gustinessLabel: gustStats.gustinessLabel,

    windStabilityLabel: windStats.windStabilityLabel,
    directionStabilityLabel: dirStats.directionStabilityLabel,

    stabilityScore,
    confidence,
  };
}

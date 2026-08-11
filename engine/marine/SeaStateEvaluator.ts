import { RegionSpotConfig } from "@/types/region";
import { MarineForecastPoint, SeaStateEvaluation, SpotSeaProfile } from "@/types/marine";
import { WaterState, WindDirection } from "@/types/weather";
import { degreesToCompass, compassToDegrees, getCircularAngleDifference } from "@/lib/windDirection";
import { interpolateCurve } from "../forecast/ForecastNormalizer";

/**
 * Evaluates coastal wave exposure score (0-100) based on incoming wave direction and spot geography.
 */
export function calculateExposureScore(
  seaProfile: SpotSeaProfile | undefined,
  waveDirectionDegrees: number | null
): number {
  if (!seaProfile || !seaProfile.exposureDirections || seaProfile.exposureDirections.length === 0) {
    return 100; // Default fully exposed if no restrictions specified
  }

  if (waveDirectionDegrees === null || isNaN(waveDirectionDegrees)) {
    return 80;
  }

  const waveCompass = degreesToCompass(waveDirectionDegrees);

  // 1. Check exact compass match
  const exactMatch = seaProfile.exposureDirections.find(
    (e) => e.direction.toUpperCase() === waveCompass.toUpperCase()
  );
  if (exactMatch) {
    return Math.max(0, Math.min(100, Math.round(exactMatch.factor * 100)));
  }

  // 2. Continuous angular proximity interpolation to configured exposure sectors
  let bestFactor = 0.2; // Baseline sheltered
  let minDiff = 180;

  for (const entry of seaProfile.exposureDirections) {
    const sectorDeg = compassToDegrees(entry.direction as WindDirection);
    const diff = getCircularAngleDifference(waveDirectionDegrees, sectorDeg);

    if (diff < minDiff) {
      minDiff = diff;
      if (diff <= 30) {
        bestFactor = entry.factor;
      } else if (diff <= 75) {
        const falloff = 1 - (diff - 30) / 45;
        bestFactor = 0.2 + (entry.factor - 0.2) * Math.max(0, falloff);
      }
    }
  }

  return Math.max(0, Math.min(100, Math.round(bestFactor * 100)));
}

/**
 * Evaluates swell direction alignment against spot preferred wave directions (0-100).
 */
export function calculateWaveAlignmentScore(
  seaProfile: SpotSeaProfile | undefined,
  waveDirectionDegrees: number | null
): number {
  if (!seaProfile || !seaProfile.preferredWaveDirections || seaProfile.preferredWaveDirections.length === 0) {
    return 80; // Default acceptable alignment
  }

  if (waveDirectionDegrees === null || isNaN(waveDirectionDegrees)) {
    return 70;
  }

  let minDiff = 180;
  for (const pref of seaProfile.preferredWaveDirections) {
    const prefDeg = compassToDegrees(pref as WindDirection);
    const diff = getCircularAngleDifference(waveDirectionDegrees, prefDeg);
    if (diff < minDiff) {
      minDiff = diff;
    }
  }

  // Circular score grading
  if (minDiff <= 15) return 100;
  if (minDiff <= 30) return 90;
  if (minDiff <= 45) return 75;
  if (minDiff <= 65) return 50;
  if (minDiff <= 90) return 25;
  return 10;
}

/**
 * Evaluates wave period / swell organization quality score (0-100).
 * Distinguishes short-period wind chop (<5s) from organized groundswell (8-12s).
 */
export function calculatePeriodOrganizationScore(
  period: number | null,
  seaProfile?: SpotSeaProfile
): number {
  if (period === null || isNaN(period) || period <= 0) {
    return 50; // Neutral default
  }

  if (seaProfile?.preferredPeriod) {
    const { min = 4, idealMin = 7, idealMax = 11 } = seaProfile.preferredPeriod;
    if (period >= idealMin && period <= idealMax) return 100;
    if (period < min) return Math.max(10, Math.round((period / min) * 40));
    if (period < idealMin) {
      return 40 + Math.round(((period - min) / (idealMin - min)) * 60);
    }
    // Very long period (> idealMax)
    return Math.max(70, 100 - (period - idealMax) * 5);
  }

  // General oceanographic scale
  if (period < 4.0) return 25;
  if (period < 5.5) return 50;
  if (period < 7.0) return 75;
  if (period <= 12.0) return 100;
  if (period <= 15.0) return 90;
  return 80;
}

/**
 * Evaluates wave height suitability score (0-100) based on spot sea profile.
 */
export function calculateWaveHeightQualityScore(
  effectiveHeight: number | null,
  seaProfile?: SpotSeaProfile
): number {
  if (effectiveHeight === null || isNaN(effectiveHeight)) {
    return 60;
  }

  if (seaProfile?.heightQualityCurve && seaProfile.heightQualityCurve.length > 0) {
    return Math.round(
      interpolateCurve(
        effectiveHeight,
        seaProfile.heightQualityCurve.map((p) => ({ x: p.height, y: p.score }))
      )
    );
  }

  if (seaProfile?.preferredWaveHeight) {
    const { min = 0.5, idealMin = 1.0, idealMax = 2.2, max = 3.2 } = seaProfile.preferredWaveHeight;
    if (effectiveHeight >= idealMin && effectiveHeight <= idealMax) return 100;
    if (effectiveHeight < min) {
      return Math.max(10, Math.round((effectiveHeight / min) * 50));
    }
    if (effectiveHeight < idealMin) {
      return 50 + Math.round(((effectiveHeight - min) / (idealMin - min)) * 50);
    }
    if (effectiveHeight > max) {
      return Math.max(0, 50 - (effectiveHeight - max) * 40);
    }
    return 100 - Math.round(((effectiveHeight - idealMax) / (max - idealMax)) * 50);
  }

  // Default wave-rider evaluation: peak quality around 1.2m - 2.2m
  if (effectiveHeight < 0.3) return 30;
  if (effectiveHeight < 0.7) return 60;
  if (effectiveHeight <= 2.2) return 95;
  if (effectiveHeight <= 3.0) return 75;
  return 40;
}

/**
 * Classifies the marine condition into domain WaterState: FLAT | CHOP | BUMP_AND_JUMP | WAVE.
 */
export function classifySeaState(
  rawWaveHeight: number | null,
  wavePeriod: number | null,
  exposureScore: number,
  alignmentScore: number,
  localWind: number
): WaterState {
  const height = rawWaveHeight ?? 0;
  const period = wavePeriod ?? 4.0;
  const effectiveHeight = height * (exposureScore / 100);

  // 1. Very small waves or fully sheltered bay
  if (effectiveHeight < 0.45) {
    return localWind < 16 ? "FLAT" : "CHOP";
  }

  // 2. Small to moderate sea (0.45m - 0.90m)
  if (effectiveHeight < 0.90) {
    if (period < 5.0) return "CHOP";
    return "BUMP_AND_JUMP";
  }

  // 3. Moderate to good sea (0.90m - 1.35m)
  if (effectiveHeight < 1.35) {
    if (period >= 6.5 && exposureScore >= 55 && alignmentScore >= 50) {
      return "WAVE";
    }
    if (period < 5.0) return "CHOP";
    return "BUMP_AND_JUMP";
  }

  // 4. Large waves (>= 1.35m)
  if (period >= 5.8 && exposureScore >= 45) {
    return "WAVE";
  }

  // Disorganized short large chop
  if (period < 5.0) return "CHOP";

  return "BUMP_AND_JUMP";
}

/**
 * Evaluates comprehensive marine conditions for a spot using external wave forecast data.
 */
export function evaluateSeaState(
  spotConfig: RegionSpotConfig,
  marinePoint: MarineForecastPoint | null | undefined,
  localWind: number,
  windDirection: WindDirection
): SeaStateEvaluation {
  if (!marinePoint || marinePoint.waveHeight === null) {
    return evaluateFallbackSeaState(spotConfig, localWind, windDirection);
  }

  const seaProfile = spotConfig.seaProfile;
  const waveHeight = marinePoint.waveHeight;
  const wavePeriod = marinePoint.wavePeriod;
  const waveDirection = marinePoint.waveDirection;

  const exposureScore = calculateExposureScore(seaProfile, waveDirection);
  const alignmentScore = calculateWaveAlignmentScore(seaProfile, waveDirection);
  const organizationScore = calculatePeriodOrganizationScore(wavePeriod, seaProfile);

  const effectiveHeight = waveHeight * (exposureScore / 100);
  const heightQualityScore = calculateWaveHeightQualityScore(effectiveHeight, seaProfile);

  // Classify physical water state
  const state = classifySeaState(
    waveHeight,
    wavePeriod,
    exposureScore,
    alignmentScore,
    localWind
  );

  // Calculate composite objective Sea Quality Score (0-100):
  // Wave condition quality is modulated by spot exposure and swell alignment
  const swellQuality = heightQualityScore * 0.55 + organizationScore * 0.45;
  const alignmentFactor = Math.max(0.1, alignmentScore / 100);
  const exposureFactor = Math.max(0.1, exposureScore / 100);
  const coastalModulation = alignmentFactor * 0.60 + exposureFactor * 0.40;

  const rawSeaQuality = swellQuality * coastalModulation;
  const seaQualityScore = Math.max(0, Math.min(100, Math.round(rawSeaQuality)));

  return {
    state,
    seaQualityScore,
    waveHeight: Math.round(effectiveHeight * 10) / 10,
    wavePeriod: wavePeriod !== null ? Math.round(wavePeriod * 10) / 10 : null,
    waveDirection,
    swellHeight: marinePoint.swellHeight,
    swellPeriod: marinePoint.swellPeriod,
    swellDirection: marinePoint.swellDirection,
    exposureScore,
    alignmentScore,
    organizationScore,
    confidence: 90,
    source: "MARINE_FORECAST",
  };
}

/**
 * Fallback water-state evaluation when marine forecast is unavailable.
 */
export function evaluateFallbackSeaState(
  spotConfig: RegionSpotConfig,
  localWind: number,
  windDirection: WindDirection
): SeaStateEvaluation {
  const styleRules = spotConfig.styleRules;
  let state: WaterState = spotConfig.defaultStyle || "BUMP_AND_JUMP";

  if (styleRules) {
    const isFavoredDir =
      !styleRules.favoredDirections || styleRules.favoredDirections.includes(windDirection);

    if (isFavoredDir && styleRules.waveThresholdWind && localWind >= styleRules.waveThresholdWind) {
      state = "WAVE";
    } else if (
      isFavoredDir &&
      styleRules.bumpAndJumpThresholdWind &&
      localWind >= styleRules.bumpAndJumpThresholdWind
    ) {
      state = "BUMP_AND_JUMP";
    } else if (localWind < 15) {
      state = "FLAT";
    } else if (localWind <= 22) {
      state = "CHOP";
    }
  } else {
    if (localWind < 15) state = "FLAT";
    else if (localWind <= 22) state = "CHOP";
  }

  // Estimated synthetic wave height from wind speed
  const estHeight = Math.round(Math.max(0.2, (localWind / 25) * 1.2) * 10) / 10;
  const estPeriod = Math.round(Math.max(3.5, 4.0 + (localWind / 30) * 2.5) * 10) / 10;

  let seaQualityScore = 60;
  if (state === "WAVE") seaQualityScore = 85;
  else if (state === "BUMP_AND_JUMP") seaQualityScore = 75;
  else if (state === "FLAT") seaQualityScore = 70;
  else if (state === "CHOP") seaQualityScore = 50;

  return {
    state,
    seaQualityScore,
    waveHeight: estHeight,
    wavePeriod: estPeriod,
    waveDirection: null,
    exposureScore: 70,
    alignmentScore: 70,
    organizationScore: 50,
    confidence: 50, // Reduced confidence in fallback mode
    source: "WIND_DERIVED_FALLBACK",
  };
}

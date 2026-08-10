import { RegionSpotConfig } from "@/types/region";
import { SpotEligibility, WaterState, WindDirection } from "@/types/weather";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { evaluateQualityCurve } from "./CurveEvaluator";
import { evaluateWaterStateQuality, evaluatePreferenceScore } from "./PreferenceEvaluator";
import { RiderPreferences } from "@/config/riderPreferences";

export interface EvaluatedHourQuality {
  eligibility: SpotEligibility;
  eligibilityReason?: string;
  waterState: WaterState;
  spotWindQuality: number;
  directionQuality: number;
  waterStateQuality: number;
  preferenceScore: number;
  sessionQualityScore: number;
}

/**
 * Generic spot eligibility evaluation driven exclusively by RegionSpotConfig and hard gates.
 */
export function evaluateSpotEligibility(
  spotConfig: RegionSpotConfig,
  localWind: number,
  directionDegrees: number,
  regimeId?: string
): { eligibility: SpotEligibility; reason?: string } {
  // 1. Evaluate configured Hard Gates
  if (spotConfig.hardGates && spotConfig.hardGates.length > 0) {
    for (const gate of spotConfig.hardGates) {
      const matchesRegime = !gate.regimes || (regimeId && gate.regimes.includes(regimeId));
      let matchesDirection = true;
      if (gate.directionRange) {
        const [minDeg, maxDeg] = gate.directionRange;
        if (minDeg <= maxDeg) {
          matchesDirection = directionDegrees >= minDeg && directionDegrees <= maxDeg;
        } else {
          // Circular seam crossing (e.g. [300, 360])
          matchesDirection = directionDegrees >= minDeg || directionDegrees <= maxDeg;
        }
      }

      const matchesMinWind = gate.minWind === undefined || localWind >= gate.minWind;
      const matchesMaxWind = gate.maxWind === undefined || localWind <= gate.maxWind;

      if (matchesRegime && matchesDirection && matchesMinWind && matchesMaxWind) {
        return { eligibility: gate.eligibility, reason: gate.reason };
      }
    }
  }

  // 2. Minimum planing threshold
  const minPlaning = spotConfig.minPlaningWind ?? 11;
  if (localWind < minPlaning) {
    return { eligibility: "UNSUITABLE", reason: "TOO_LIGHT" };
  }

  // 3. Extreme gust / safety threshold
  if (localWind > 42) {
    return { eligibility: "UNSUITABLE", reason: "TOO_STRONG" };
  }

  // 4. Marginal threshold
  if (localWind < (spotConfig.idealWindMin ?? 15) - 3) {
    return { eligibility: "MARGINAL", reason: "ACCEPTABLE_CONDITIONS" };
  }

  // 5. Ideal conditions check
  const isIdealWind =
    localWind >= (spotConfig.idealWindMin ?? 18) &&
    localWind <= (spotConfig.idealWindMax ?? 28);

  let isIdealDirection = true;
  if (spotConfig.idealDirectionDegrees) {
    const [minD, maxD] = spotConfig.idealDirectionDegrees;
    if (minD <= maxD) {
      isIdealDirection = directionDegrees >= minD && directionDegrees <= maxD;
    } else {
      isIdealDirection = directionDegrees >= minD || directionDegrees <= maxD;
    }
  }

  if (isIdealWind && isIdealDirection) {
    return { eligibility: "IDEAL", reason: "IDEAL_CONDITIONS" };
  }

  return { eligibility: "SUITABLE", reason: "ACCEPTABLE_CONDITIONS" };
}

/**
 * Calculates total session quality score (0-100) from weighted composite factors.
 */
export function computeSessionQualityScore(
  eligibility: SpotEligibility,
  spotWindQuality: number,
  directionQuality: number,
  waterStateQuality: number,
  preferenceScore: number,
  gustScore: number,
  confidenceScore: number
): number {
  if (eligibility === "UNSUITABLE") {
    return 0;
  }

  const w = SCORING_CONFIG.sessionWeights;
  const rawScore =
    spotWindQuality * w.spotWindQuality +
    directionQuality * w.directionQuality +
    waterStateQuality * w.waterStateQuality +
    preferenceScore * w.personalPreference +
    gustScore * w.gustQuality +
    confidenceScore * w.confidence;

  let eligibilityMultiplier = 1.0;
  if (eligibility === "MARGINAL") {
    eligibilityMultiplier = 0.70;
  }

  return Math.max(0, Math.min(100, Math.round(rawScore * eligibilityMultiplier)));
}

/**
 * Evaluates full hourly quality packet for a spot.
 */
export function evaluateHourQuality(
  spotConfig: RegionSpotConfig,
  localWind: number,
  localGust: number,
  directionDegrees: number,
  directionLabel: WindDirection,
  directionQuality: number,
  waterState: WaterState,
  gustScore: number,
  confidenceScore: number,
  regimeId?: string,
  riderPrefs?: RiderPreferences
): EvaluatedHourQuality {
  const { eligibility, reason } = evaluateSpotEligibility(
    spotConfig,
    localWind,
    directionDegrees,
    regimeId
  );

  const spotWindQuality = Math.round(evaluateQualityCurve(spotConfig.qualityCurve, localWind));
  const waterStateQuality = evaluateWaterStateQuality(waterState, riderPrefs);
  const preferenceScore = evaluatePreferenceScore(
    spotConfig,
    waterState,
    localWind,
    directionLabel,
    riderPrefs
  );

  const sessionQualityScore = computeSessionQualityScore(
    eligibility,
    spotWindQuality,
    directionQuality,
    waterStateQuality,
    preferenceScore,
    gustScore,
    confidenceScore
  );

  return {
    eligibility,
    eligibilityReason: reason,
    waterState,
    spotWindQuality,
    directionQuality,
    waterStateQuality,
    preferenceScore,
    sessionQualityScore,
  };
}

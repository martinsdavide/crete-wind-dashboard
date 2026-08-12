import { RegionSpotConfig } from "@/types/region";
import { SpotEligibility, WaterState, WindDirection } from "@/types/weather";
import { SeaStateEvaluation } from "@/types/marine";
import { SCORING_CONFIG } from "@/config/windProfiles";
import { evaluateQualityCurve } from "./CurveEvaluator";
import { evaluateWaterStateQuality, evaluatePreferenceScore } from "./PreferenceEvaluator";
import { RiderPreferences } from "@/config/riderPreferences";
import { evaluateFallbackSeaState } from "../marine/SeaStateEvaluator";

export interface EvaluatedHourQuality {
  eligibility: SpotEligibility;
  eligibilityReason?: string;
  waterState: WaterState;
  seaState?: SeaStateEvaluation;
  spotWindQuality: number;
  directionQuality: number;
  seaQualityScore: number;
  waterStateQuality: number; // legacy backward-compatibility alias
  preferenceScore: number;
  sessionQualityScore: number;
}

/**
 * Generic spot eligibility evaluation driven by RegionSpotConfig, wind, and marine hard gates.
 */
export function evaluateSpotEligibility(
  spotConfig: RegionSpotConfig,
  localWind: number,
  directionDegrees: number,
  regimeId?: string,
  seaEval?: SeaStateEvaluation
): { eligibility: SpotEligibility; reason?: string } {
  // 1. Evaluate configured Hard Gates (both atmospheric and marine)
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

      // Optional Marine Hard Gates
      let matchesMarine = true;
      if (seaEval) {
        if (gate.minWaveHeight !== undefined && seaEval.waveHeight !== null) {
          if (seaEval.waveHeight < gate.minWaveHeight) matchesMarine = false;
        }
        if (gate.maxWaveHeight !== undefined && seaEval.waveHeight !== null) {
          if (seaEval.waveHeight > gate.maxWaveHeight) matchesMarine = false;
        }
        if (gate.minWavePeriod !== undefined && seaEval.wavePeriod !== null) {
          if (seaEval.wavePeriod < gate.minWavePeriod) matchesMarine = false;
        }
        if (gate.waveDirectionRange && seaEval.waveDirection !== null) {
          const [minWD, maxWD] = gate.waveDirectionRange;
          const wd = seaEval.waveDirection;
          const inside = minWD <= maxWD ? wd >= minWD && wd <= maxWD : wd >= minWD || wd <= maxWD;
          if (!inside) matchesMarine = false;
        }
      }

      if (matchesRegime && matchesDirection && matchesMinWind && matchesMaxWind && matchesMarine) {
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
 * Incorporates independent Wind Quality, Direction Quality, Sea Quality, Rider Preference, Gust Stability, and Confidence.
 */
export function computeSessionQualityScore(
  eligibility: SpotEligibility,
  spotWindQuality: number,
  directionQuality: number,
  seaQualityScore: number,
  preferenceScore: number,
  gustScore: number,
  confidenceScore: number
): number {
  if (eligibility === "UNSUITABLE") {
    return 0;
  }

  const w = SCORING_CONFIG.sessionWeights;
  const seaWeight = (w as any).seaQuality ?? w.waterStateQuality ?? 0.20;

  const rawScore =
    spotWindQuality * w.spotWindQuality +
    directionQuality * w.directionQuality +
    seaQualityScore * seaWeight +
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
 * Evaluates full hourly quality packet for a spot combining wind and marine conditions.
 */
export function evaluateHourQuality(
  spotConfig: RegionSpotConfig,
  localWind: number,
  localGust: number,
  directionDegrees: number,
  directionLabel: WindDirection,
  directionQuality: number,
  seaStateInput: SeaStateEvaluation | WaterState,
  gustScore: number,
  confidenceScore: number,
  regimeId?: string,
  riderPrefs?: RiderPreferences
): EvaluatedHourQuality {
  // Support both full SeaStateEvaluation object and legacy WaterState string
  const seaEval: SeaStateEvaluation =
    typeof seaStateInput === "string"
      ? evaluateFallbackSeaState(spotConfig, localWind, directionLabel)
      : seaStateInput;

  const waterState = seaEval.state;
  const seaQualityScore = seaEval.seaQualityScore;

  const { eligibility, reason } = evaluateSpotEligibility(
    spotConfig,
    localWind,
    directionDegrees,
    regimeId,
    seaEval
  );

  const qualityCurveToUse =
    (regimeId && spotConfig.regimeQualityCurves?.[regimeId]) || spotConfig.qualityCurve;
  const spotWindQuality = Math.round(evaluateQualityCurve(qualityCurveToUse, localWind));
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
    seaQualityScore,
    preferenceScore,
    gustScore,
    confidenceScore
  );

  return {
    eligibility,
    eligibilityReason: reason,
    waterState,
    seaState: seaEval,
    spotWindQuality,
    directionQuality,
    seaQualityScore,
    waterStateQuality: seaQualityScore,
    preferenceScore,
    sessionQualityScore,
  };
}

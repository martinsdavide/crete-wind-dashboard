import { SpotId } from "@/types/spot";
import {
  SpotEligibility,
  SpotForecast,
  WaterState,
  WindDirection,
  WindRegime,
} from "@/types/weather";
import { SPOT_QUALITY_PROFILES } from "@/config/qualityProfiles";
import { DEFAULT_RIDER_PREFERENCES } from "@/config/riderPreferences";
import { SCORING_CONFIG } from "@/config/windProfiles";

/**
 * Calculates spot-specific wind quality (0-100) using the spot's non-monotonic quality curve.
 */
export function calculateSpotWindQuality(spotId: SpotId, localWind: number): number {
  const profile = SPOT_QUALITY_PROFILES[spotId];
  const curve = profile.qualityCurve;
  const safeWind = Math.max(0, isNaN(localWind) ? 0 : localWind);

  if (curve.length === 0) return 0;

  if (safeWind <= curve[0].wind) {
    // Ramp up from 0 to first point
    return (safeWind / curve[0].wind) * curve[0].score;
  }

  const lastPoint = curve[curve.length - 1];
  if (safeWind >= lastPoint.wind) {
    return Math.max(0, lastPoint.score - (safeWind - lastPoint.wind) * 2);
  }

  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];

    if (safeWind >= p1.wind && safeWind <= p2.wind) {
      const span = p2.wind - p1.wind;
      if (span === 0) return p1.score;
      const fraction = (safeWind - p1.wind) / span;
      return p1.score + fraction * (p2.score - p1.score);
    }
  }

  return 0;
}

/**
 * Calculates water state quality (0-100) based on rider preferences for the estimated state.
 */
export function calculateWaterStateQuality(
  waterState: WaterState,
  riderPrefs = DEFAULT_RIDER_PREFERENCES
): number {
  switch (waterState) {
    case "WAVE":
      return Math.round(riderPrefs.preferredStyles.wave * 100);
    case "BUMP_AND_JUMP":
      return Math.round(riderPrefs.preferredStyles.bumpAndJump * 100);
    case "FLAT":
      return Math.round(riderPrefs.preferredStyles.flatWater * 100);
    case "CHOP":
      return 50;
    default:
      return 60;
  }
}

/**
 * Calculates personal preference score (0-100) including spot affinity, wave bonuses, and comfort limits.
 */
export function calculatePreferenceScore(
  spotId: SpotId,
  waterState: WaterState,
  localWind: number,
  directionLabel: WindDirection,
  riderPrefs = DEFAULT_RIDER_PREFERENCES
): number {
  const baseAffinity = (riderPrefs.spotPreferences[spotId] ?? 1.0) * 80;
  let bonus = 0;
  let penalty = 0;

  // Wave bonus for Tenda in Meltemi
  if (spotId === "tenda" && waterState === "WAVE" && localWind >= 22) {
    const isMeltemi = ["N", "NNW", "NW", "WNW"].includes(directionLabel);
    if (isMeltemi) {
      const progressiveBonus = Math.min(
        riderPrefs.waveBonusMax,
        (localWind - 22) * 1.5 + 4
      );
      bonus += progressiveBonus;
    }
  }

  // Comfort ceiling penalty
  const comfortCeiling = riderPrefs.maxComfortWindBySpot[spotId] ?? 30;
  if (localWind > comfortCeiling) {
    penalty += (localWind - comfortCeiling) * 4;
  }

  return Math.max(0, Math.min(100, Math.round(baseAffinity + bonus - penalty)));
}

/**
 * Calculates total session quality score (0-100).
 * If spot is UNSUITABLE, returns 0.
 */
export function calculateSessionQualityScore(
  spotId: SpotId,
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

  // Eligibility scaling
  let eligibilityMultiplier = 1.0;
  if (eligibility === "MARGINAL") {
    eligibilityMultiplier = 0.70;
  }

  return Math.max(0, Math.min(100, Math.round(rawScore * eligibilityMultiplier)));
}

/**
 * Generates clear, human-readable explanations for why the best spot was selected.
 */
export function explainRecommendation(
  bestSpot: SpotId | null,
  regime: WindRegime,
  spotsForecasts: Record<SpotId, SpotForecast | null>
): string[] {
  if (!bestSpot) {
    return ["Light or variable winds across all spots today."];
  }

  const explanations: string[] = [];
  const kForecast = spotsForecasts.kouremenos;
  const tForecast = spotsForecasts.tenda;
  const xForecast = spotsForecasts.xerokampos;

  const kToday = kForecast?.days?.[0];
  const tToday = tForecast?.days?.[0];
  const xToday = xForecast?.days?.[0];

  if (bestSpot === "tenda") {
    if (regime === "MELTEMI_STRONG") {
      explanations.push(
        "Strong Meltemi flow is active. Tenda provides the best session quality with wave / bump & jump conditions matching your preferences."
      );
      if (kToday && kToday.maxWind >= 26) {
        explanations.push(
          `Kouremenos is heavily penalized because local gusts (${kToday.maxGust} kt) exceed your comfortable wind ceiling.`
        );
      }
      explanations.push("Xerokampos is excluded due to hazardous offshore Meltemi flow.");
    } else {
      explanations.push(
        "Tenda is delivering clean northerly wind within its ideal 20–30 kt range with superior water state."
      );
    }
  } else if (bestSpot === "kouremenos") {
    if (regime === "MELTEMI_MODERATE" || regime === "MELTEMI_LIGHT") {
      explanations.push(
        "Moderate Meltemi conditions favour Kouremenos. Local thermal and orographic acceleration place the wind squarely in its sweet spot (18–23 kt)."
      );
      if (tToday && tToday.maxWind < 18) {
        explanations.push(
          `Tenda is lighter (${tToday.minWind}–${tToday.maxWind} kt) and below its optimal wave-generation threshold.`
        );
      }
    } else {
      explanations.push("Kouremenos provides the most consistent local conditions today.");
    }
  } else if (bestSpot === "xerokampos") {
    explanations.push(
      "Meltemi is absent and flow has shifted W/SW. Xerokampos is the prime alternative spot, receiving clean side-onshore thermal breeze."
    );
    explanations.push("Kouremenos and Tenda are calm or unsuitable under southwesterly flow.");
  }

  return explanations;
}

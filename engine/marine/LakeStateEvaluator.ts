import { RegionSpotConfig } from "@/types/region";
import { SeaStateEvaluation } from "@/types/marine";
import { WaterState, WindDirection } from "@/types/weather";

/**
 * Inland Lake State Evaluator
 * Estimates lake wave height, period, and surface water state using directional fetch,
 * local wind speed, and lake-specific thresholds without querying offshore marine models.
 */
export function evaluateLakeState(
  spotConfig: RegionSpotConfig,
  localWind: number,
  windDirection: WindDirection,
  gustSpeed?: number
): SeaStateEvaluation {
  const profile = spotConfig.lakeProfile;
  const styleRules = spotConfig.styleRules;

  // 1. Resolve directional fetch (in km)
  const fetchKm = profile?.fetchByDirectionKm?.[windDirection] ?? 6.0;

  // 2. Physical estimation of significant lake wave height (SMB formula for enclosed waters)
  // Hs is bounded by wind speed and fetch
  const rawHeight = 0.0032 * Math.sqrt(Math.max(1.0, fetchKm)) * Math.pow(Math.max(0, localWind), 1.18);
  const estimatedHeight = Math.round(Math.min(2.0, Math.max(0.1, rawHeight)) * 10) / 10;

  // 3. Physical estimation of wave period (inland lake short-period waves: 2.5s - 5.5s)
  const rawPeriod = 2.4 + 0.06 * localWind + 0.05 * Math.min(25, fetchKm);
  const estimatedPeriod = Math.round(Math.min(6.0, Math.max(2.5, rawPeriod)) * 10) / 10;

  // 4. Water-state classification
  const flatThresh = profile?.flatThresholdKt ?? 12;
  const chopThresh = profile?.chopThresholdKt ?? 16;
  const rampThresh = profile?.rampThresholdKt ?? 24;
  const extremeThresh = profile?.extremeThresholdKt ?? 35;

  let state: WaterState = spotConfig.defaultStyle || "BUMP_AND_JUMP";

  if (localWind < flatThresh) {
    state = spotConfig.defaultStyle === "FLAT" ? "FLAT" : "CHOP";
  } else if (localWind < chopThresh) {
    state = "CHOP";
  } else if (localWind < rampThresh) {
    state = "BUMP_AND_JUMP";
  } else {
    // High wind on the lake creates steep chop ramps or small wave break
    state = spotConfig.defaultStyle === "WAVE" || estimatedHeight >= 0.9 ? "WAVE" : "BUMP_AND_JUMP";
  }

  // 5. Objective Sea/Lake Quality Score (0-100)
  let seaQualityScore = 70;
  if (state === "WAVE") {
    seaQualityScore = localWind >= extremeThresh ? 75 : 90;
  } else if (state === "BUMP_AND_JUMP") {
    seaQualityScore = 85;
  } else if (state === "CHOP") {
    seaQualityScore = 65;
  } else if (state === "FLAT") {
    seaQualityScore = 80;
  }

  // Modulate quality if direction is favored by spot style rules
  if (styleRules?.favoredDirections && !styleRules.favoredDirections.includes(windDirection)) {
    seaQualityScore = Math.max(40, seaQualityScore - 15);
  }

  return {
    state,
    seaQualityScore,
    waveHeight: estimatedHeight,
    rawWaveHeight: null,
    wavePeriod: estimatedPeriod,
    waveDirection: null,
    exposureScore: profile?.exposureByDirection?.[windDirection] ?? 75,
    alignmentScore: 80,
    organizationScore: Math.min(100, Math.round(estimatedPeriod * 14)),
    confidence: 65,
    source: "WIND_DERIVED_FALLBACK",
  };
}

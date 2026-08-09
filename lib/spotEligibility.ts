import { SpotId } from "@/types/spot";
import { SpotEligibility, WindDirection, WindRegime } from "@/types/weather";
import { SPOT_QUALITY_PROFILES } from "@/config/qualityProfiles";
import { normalizeDegrees } from "./windDirection";

/**
 * Evaluates spot eligibility (IDEAL, SUITABLE, MARGINAL, UNSUITABLE).
 * UNSUITABLE spots are hard-gated and cannot be selected as Best Spot.
 */
export function calculateSpotEligibility(
  spotId: SpotId,
  directionDegrees: number,
  directionLabel: WindDirection,
  localWind: number,
  regime: WindRegime
): SpotEligibility {
  const profile = SPOT_QUALITY_PROFILES[spotId];
  const normDeg = normalizeDegrees(directionDegrees);
  const safeWind = Math.max(0, isNaN(localWind) ? 0 : localWind);

  // 1. Hard Gate: Xerokampos Meltemi exclusion (300°–060° with significant wind >= 12kt)
  if (spotId === "xerokampos") {
    const isNortherlyMeltemi = normDeg >= 300 || normDeg <= 60;
    if (isNortherlyMeltemi && safeWind >= 12) {
      return "UNSUITABLE";
    }
  }

  // 2. Hard Gate: Excluded direction sectors
  if (profile.excludedDirections.includes(directionLabel)) {
    return "UNSUITABLE";
  }

  // 3. Hard Gate: Hard wind ceiling
  if (profile.hardWindLimit && safeWind >= profile.hardWindLimit) {
    return "UNSUITABLE";
  }

  // 4. Too light to sail (< 11 kt)
  if (safeWind < 11) {
    return "MARGINAL";
  }

  // 5. Ideal evaluation
  const isPreferredDir = profile.preferredDirections.includes(directionLabel);
  const isIdealWind =
    safeWind >= profile.idealWindRange.min && safeWind <= profile.idealWindRange.max;

  if (isPreferredDir && isIdealWind) {
    return "IDEAL";
  }

  // 6. Suitable evaluation
  const isAcceptableDir = profile.acceptableDirections.includes(directionLabel);
  const isUsableWind =
    safeWind >= profile.usableWindRange.min && safeWind <= profile.usableWindRange.max;

  if ((isPreferredDir || isAcceptableDir) && isUsableWind) {
    return "SUITABLE";
  }

  // 7. Otherwise Marginal (e.g. acceptable direction but overpowered/underpowered)
  return "MARGINAL";
}

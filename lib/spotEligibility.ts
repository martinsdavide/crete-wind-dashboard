import { SpotId } from "@/types/spot";
import {
  SpotEligibility,
  SpotEligibilityReason,
  WindDirection,
  WindRegime,
} from "@/types/weather";
import { SPOT_QUALITY_PROFILES } from "@/config/qualityProfiles";
import { normalizeDegrees } from "./windDirection";

export interface SpotEligibilityResult {
  eligibility: SpotEligibility;
  reason: SpotEligibilityReason;
}

/**
 * Evaluates spot eligibility and specific reason (IDEAL, SUITABLE, MARGINAL, UNSUITABLE).
 * Correctly checks calm wind before direction exclusions, unless an active offshore Meltemi hazard exists.
 */
export function calculateSpotEligibility(
  spotId: SpotId,
  directionDegrees: number,
  directionLabel: WindDirection,
  localWind: number,
  regime?: WindRegime
): SpotEligibilityResult {
  const profile = SPOT_QUALITY_PROFILES[spotId];
  const normDeg = normalizeDegrees(directionDegrees);
  const safeWind = Math.max(0, isNaN(localWind) ? 0 : localWind);

  // 1. Hard Gate: Xerokampos Meltemi offshore exclusion (300°–060° with significant wind >= 12kt)
  if (spotId === "xerokampos") {
    const isNortherlyMeltemi = normDeg >= 300 || normDeg <= 60;
    if (isNortherlyMeltemi && safeWind >= 12) {
      return { eligibility: "UNSUITABLE", reason: "OFFSHORE_MELTEMI" };
    }
  }

  // 2. Light wind (< 11 kt): Mark as MARGINAL / TOO_LIGHT rather than wrong direction
  if (safeWind < 11) {
    return { eligibility: "MARGINAL", reason: "TOO_LIGHT" };
  }

  // 3. Hard Gate: Hard wind ceiling
  if (profile.hardWindLimit && safeWind >= profile.hardWindLimit) {
    return { eligibility: "UNSUITABLE", reason: "TOO_STRONG" };
  }

  // 4. Hard Gate: Excluded direction sectors
  if (profile.excludedDirections.includes(directionLabel)) {
    return { eligibility: "UNSUITABLE", reason: "WRONG_DIRECTION" };
  }

  // 5. Ideal evaluation
  const isPreferredDir = profile.preferredDirections.includes(directionLabel);
  const isIdealWind =
    safeWind >= profile.idealWindRange.min && safeWind <= profile.idealWindRange.max;

  if (isPreferredDir && isIdealWind) {
    return { eligibility: "IDEAL", reason: "IDEAL_CONDITIONS" };
  }

  // 6. Suitable evaluation
  const isAcceptableDir = profile.acceptableDirections.includes(directionLabel);
  const isUsableWind =
    safeWind >= profile.usableWindRange.min && safeWind <= profile.usableWindRange.max;

  if ((isPreferredDir || isAcceptableDir) && isUsableWind) {
    return { eligibility: "SUITABLE", reason: "ACCEPTABLE_CONDITIONS" };
  }

  // 7. Marginal (e.g. acceptable direction but overpowered/underpowered)
  if (safeWind > profile.usableWindRange.max) {
    return { eligibility: "MARGINAL", reason: "TOO_STRONG" };
  }

  return { eligibility: "MARGINAL", reason: "ACCEPTABLE_CONDITIONS" };
}

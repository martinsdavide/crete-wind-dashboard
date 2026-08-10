import { RegionSpotConfig } from "@/types/region";
import { WaterState, WindDirection } from "@/types/weather";
import { DEFAULT_RIDER_PREFERENCES, RiderPreferences } from "@/config/riderPreferences";

/**
 * Calculates water state quality (0-100) based on rider preferences for the estimated water state.
 */
export function evaluateWaterStateQuality(
  waterState: WaterState,
  riderPrefs: RiderPreferences = DEFAULT_RIDER_PREFERENCES
): number {
  switch (waterState) {
    case "WAVE":
      return Math.round((riderPrefs.preferredStyles.wave ?? 0.8) * 100);
    case "BUMP_AND_JUMP":
      return Math.round((riderPrefs.preferredStyles.bumpAndJump ?? 0.9) * 100);
    case "FLAT":
      return Math.round((riderPrefs.preferredStyles.flatWater ?? 1.0) * 100);
    case "CHOP":
      return 50;
    default:
      return 60;
  }
}

/**
 * Calculates generic personal preference score (0-100) including spot affinity, wave bonuses,
 * and comfort ceiling limits using configuration only.
 */
export function evaluatePreferenceScore(
  spotConfig: RegionSpotConfig,
  waterState: WaterState,
  localWind: number,
  directionLabel: WindDirection,
  riderPrefs: RiderPreferences = DEFAULT_RIDER_PREFERENCES
): number {
  const baseAffinity = (riderPrefs.spotPreferences[spotConfig.id] ?? 1.0) * 80;
  let bonus = 0;
  let penalty = 0;

  // Wave / Bump & Jump style bonus if spot rules favor this direction/wind
  const styleRules = spotConfig.styleRules;
  if (styleRules && (waterState === "WAVE" || waterState === "BUMP_AND_JUMP")) {
    const isFavoredDirection =
      !styleRules.favoredDirections ||
      styleRules.favoredDirections.includes(directionLabel);

    const minThreshold = styleRules.waveThresholdWind ?? 18;

    if (isFavoredDirection && localWind >= minThreshold) {
      const progressiveBonus = Math.min(
        riderPrefs.waveBonusMax ?? 15,
        (localWind - minThreshold) * 1.5 + (waterState === "WAVE" ? 5 : 2)
      );
      bonus += progressiveBonus;
    }
  }

  // Comfort ceiling penalty
  const comfortCeiling =
    riderPrefs.maxComfortWindBySpot[spotConfig.id] ??
    spotConfig.comfortCeilingWind ??
    30;

  if (localWind > comfortCeiling) {
    penalty += (localWind - comfortCeiling) * 4.0;
  }

  return Math.max(0, Math.min(100, Math.round(baseAffinity + bonus - penalty)));
}

import { SpotId } from "@/types/spot";
import { WaterState, WindDirection } from "@/types/weather";

/**
 * Estimates the water state / sailing style (FLAT, CHOP, BUMP_AND_JUMP, WAVE)
 * based on spot geography, wind direction, and wind speed.
 */
export function estimateWaterState(
  spotId: SpotId,
  directionLabel: WindDirection,
  localWind: number
): WaterState {
  const safeWind = Math.max(0, isNaN(localWind) ? 0 : localWind);

  if (spotId === "tenda") {
    // Tenda windward area generates ramps & waves under northerly Meltemi & exposed WNW/NNE
    const isMeltemiDir = ["N", "NNW", "NW", "WNW", "NNE", "NE"].includes(directionLabel);
    if (isMeltemiDir && safeWind >= 20) {
      return "WAVE";
    }
    if (safeWind >= 16) {
      return "BUMP_AND_JUMP";
    }
    return "FLAT";
  }

  if (spotId === "kouremenos") {
    // Kouremenos has flat inside section in moderate wind, turning to steep chop/bump in strong wind
    if (safeWind >= 26) {
      return "CHOP";
    }
    if (safeWind >= 18) {
      return "BUMP_AND_JUMP";
    }
    return "FLAT";
  }

  if (spotId === "xerokampos") {
    if (safeWind >= 28 && ["SW", "SSW"].includes(directionLabel)) {
      return "WAVE";
    }
    if (safeWind >= 22) {
      return "CHOP";
    }
    return "FLAT";
  }

  return "FLAT";
}

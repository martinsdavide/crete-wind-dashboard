import { RegionSpotConfig } from "@/types/region";

/**
 * Resolves the canonical minimum planing wind speed (kt) for a given spot.
 * Prefers `minPlaningWind`, falling back to deprecated `minWindSpeedKt`, and defaults to 11 kt.
 */
export function resolveMinimumPlaningWind(spot: RegionSpotConfig | { minPlaningWind?: number; minWindSpeedKt?: number }): number {
  if (
    spot.minPlaningWind !== undefined &&
    spot.minWindSpeedKt !== undefined &&
    spot.minPlaningWind !== spot.minWindSpeedKt
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[SpotPilot Warning] Spot has conflicting minPlaningWind (${spot.minPlaningWind} kt) and deprecated minWindSpeedKt (${spot.minWindSpeedKt} kt). Canonical minPlaningWind will be used.`
      );
    }
  }

  return spot.minPlaningWind ?? spot.minWindSpeedKt ?? 11;
}

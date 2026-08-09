import { WindRegime } from "@/types/weather";
import { normalizeDegrees } from "./windDirection";
import { REGIME_DEFINITIONS } from "@/config/regimeProfiles";

/**
 * Detects the macro wind regime (Meltemi Strong/Moderate/Light, Westerly, Southwesterly, or Other)
 * based on regional wind speed and dominant direction.
 */
export function detectWindRegime(
  regionalWind: number,
  directionDegrees: number
): { regime: WindRegime; label: string; description: string } {
  const normDeg = normalizeDegrees(directionDegrees);
  const safeWind = Math.max(0, isNaN(regionalWind) ? 0 : regionalWind);

  // Northerly flow: 300° to 360° and 0° to 65° (NW, NNW, N, NNE, NE, ENE)
  const isNortherly = normDeg >= 300 || normDeg <= 65;

  // Westerly flow: 250° to 299° (WSW, W, WNW)
  const isWesterly = normDeg >= 250 && normDeg < 300;

  // Southwesterly flow: 195° to 249° (SSW, SW)
  const isSouthwesterly = normDeg >= 195 && normDeg < 250;

  let regime: WindRegime = "OTHER";

  if (isNortherly) {
    if (safeWind >= 24) {
      regime = "MELTEMI_STRONG";
    } else if (safeWind >= 15) {
      regime = "MELTEMI_MODERATE";
    } else {
      regime = "MELTEMI_LIGHT";
    }
  } else if (isWesterly) {
    regime = "WESTERLY";
  } else if (isSouthwesterly) {
    regime = "SOUTHWESTERLY";
  } else {
    regime = "OTHER";
  }

  const definition = REGIME_DEFINITIONS[regime];
  return {
    regime,
    label: definition.label,
    description: definition.description,
  };
}

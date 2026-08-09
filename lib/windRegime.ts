import { WindRegime } from "@/types/weather";
import { normalizeDegrees } from "./windDirection";
import { REGIME_DEFINITIONS } from "@/config/regimeProfiles";

/**
 * Calculates circular average of angles in degrees.
 */
export function circularMeanDegrees(angles: number[]): number {
  if (angles.length === 0) return 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }
  const meanRad = Math.atan2(sumSin / angles.length, sumCos / angles.length);
  let meanDeg = (meanRad * 180) / Math.PI;
  if (meanDeg < 0) meanDeg += 360;
  return normalizeDegrees(meanDeg);
}

/**
 * Detects the macro wind regime (Meltemi Strong/Moderate/Light, Westerly, Southwesterly, or Other)
 * based on uncorrected regional wind speed and dominant direction.
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

/**
 * Derives true regional synoptic flow from Kouremenos + Tenda raw uncorrected model data.
 * Excludes Xerokampos from the regional Meltemi reference.
 */
export function calculateRegionalReferenceFlow(
  kouremenosModelWind: number | null,
  kouremenosModelDir: number | null,
  tendaModelWind: number | null,
  tendaModelDir: number | null,
  fallbackModelWind = 0,
  fallbackModelDir = 315
): { regionalWind: number; regionalDirection: number; regime: WindRegime; label: string; description: string } {
  const winds: number[] = [];
  const dirs: number[] = [];

  if (kouremenosModelWind !== null && !isNaN(kouremenosModelWind)) {
    winds.push(kouremenosModelWind);
    if (kouremenosModelDir !== null && !isNaN(kouremenosModelDir)) {
      dirs.push(kouremenosModelDir);
    }
  }

  if (tendaModelWind !== null && !isNaN(tendaModelWind)) {
    winds.push(tendaModelWind);
    if (tendaModelDir !== null && !isNaN(tendaModelDir)) {
      dirs.push(tendaModelDir);
    }
  }

  const regionalWind =
    winds.length > 0
      ? winds.reduce((a, b) => a + b, 0) / winds.length
      : fallbackModelWind;

  const regionalDirection =
    dirs.length > 0 ? circularMeanDegrees(dirs) : fallbackModelDir;

  const { regime, label, description } = detectWindRegime(
    regionalWind,
    regionalDirection
  );

  return {
    regionalWind,
    regionalDirection,
    regime,
    label,
    description,
  };
}

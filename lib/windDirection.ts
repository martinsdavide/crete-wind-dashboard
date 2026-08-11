import { WindDirection } from "@/types/weather";

export const COMPASS_DIRECTIONS: WindDirection[] = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

/**
 * Normalizes any degree value into the [0, 360) range.
 */
export function normalizeDegrees(degrees: number): number {
  if (isNaN(degrees) || !isFinite(degrees)) return 0;
  let normalized = degrees % 360;
  if (normalized < 0) normalized += 360;
  if (Math.abs(normalized - 360) < 1e-9 || normalized === 360 || Object.is(normalized, -0)) {
    normalized = 0;
  }
  return normalized === 0 ? 0 : normalized;
}

/**
 * Converts degrees (0-360) into one of 16 compass sectors.
 * Each sector spans 22.5 degrees.
 */
export function degreesToCompass(degrees: number): WindDirection {
  const norm = normalizeDegrees(degrees);
  const index = Math.round(norm / 22.5) % 16;
  return COMPASS_DIRECTIONS[index];
}

/**
 * Meteorological wind direction is where the wind blows FROM.
 * Arrow rotation is where the wind blows TO (degrees + 180).
 */
export function compassToArrowRotation(degrees: number): number {
  const norm = normalizeDegrees(degrees);
  return (norm + 180) % 360;
}

/**
 * Computes circular/vector mean of a list of degree angles.
 * Prevents arithmetic errors like average(350°, 10°) = 180°.
 */
export function circularMeanDegrees(degreesArray: number[]): number {
  if (!degreesArray || degreesArray.length === 0) return 0;

  let sumSin = 0;
  let sumCos = 0;
  let validCount = 0;

  for (const deg of degreesArray) {
    if (isNaN(deg) || !isFinite(deg)) continue;
    const rad = (normalizeDegrees(deg) * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
    validCount++;
  }

  if (validCount === 0) return 0;

  const meanRad = Math.atan2(sumSin / validCount, sumCos / validCount);
  let meanDeg = (meanRad * 180) / Math.PI;
  const rounded = Math.round(meanDeg * 1e6) / 1e6;
  return normalizeDegrees(rounded);
}

/**
 * Returns both the circular mean degrees and the corresponding compass label.
 */
export function getDominantDirection(degreesArray: number[]): {
  degrees: number;
  label: WindDirection;
} {
  const rawDegrees = circularMeanDegrees(degreesArray);
  const degrees = Math.round(rawDegrees) % 360;
  const label = degreesToCompass(degrees);
  return { degrees, label };
}

/**
 * Converts a compass direction label (e.g. "NW", "SW") to center degrees (0-359).
 */
export function compassToDegrees(dir: WindDirection | string): number {
  const index = COMPASS_DIRECTIONS.indexOf(dir.toUpperCase() as WindDirection);
  if (index === -1) return 0;
  return normalizeDegrees(index * 22.5);
}

/**
 * Calculates the shortest angular difference between two angles in degrees (0-180).
 */
export function getCircularAngleDifference(a: number, b: number): number {
  const normA = normalizeDegrees(a);
  const normB = normalizeDegrees(b);
  const diff = Math.abs(normA - normB);
  return diff > 180 ? 360 - diff : diff;
}


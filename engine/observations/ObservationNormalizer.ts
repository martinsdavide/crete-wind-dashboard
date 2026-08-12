/**
 * Unit conversion and standardization utilities for the Observation Ingestion pipeline.
 */

export const MS_TO_KNOTS = 1.94384;
export const KNOTS_TO_MS = 0.514444;
export const KMH_TO_MS = 0.277778;

export function msToKnots(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined || isNaN(ms)) return null;
  return Math.round(ms * MS_TO_KNOTS * 10) / 10;
}

export function knotsToMs(knots: number | null | undefined): number | null {
  if (knots === null || knots === undefined || isNaN(knots)) return null;
  return Math.round(knots * KNOTS_TO_MS * 100) / 100;
}

export function kmhToMs(kmh: number | null | undefined): number | null {
  if (kmh === null || kmh === undefined || isNaN(kmh)) return null;
  return Math.round(kmh * KMH_TO_MS * 100) / 100;
}

export function normalizeDirectionDeg(deg: number | null | undefined): number | null {
  if (deg === null || deg === undefined || isNaN(deg)) return null;
  let normalized = deg % 360;
  if (normalized < 0) normalized += 360;
  return Math.round(normalized);
}

export function normalizeTimestampToUtc(rawDate: string | number | Date): string {
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      return new Date().toISOString();
    }
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

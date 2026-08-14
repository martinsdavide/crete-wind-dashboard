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

export function parseLocalTimeToUtc(
  localIsoStr: string,
  timeZone: string = "Europe/Rome"
): string {
  if (!localIsoStr) return new Date().toISOString();
  const trimmed = localIsoStr.trim();
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  const [, Y, M, D, h, m, s] = match;
  const year = parseInt(Y, 10);
  const month = parseInt(M, 10) - 1;
  const day = parseInt(D, 10);
  const hours = parseInt(h, 10);
  const minutes = parseInt(m, 10);
  const seconds = parseInt(s || "0", 10);

  const utcGuess = new Date(Date.UTC(year, month, day, hours, minutes, seconds));

  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = dtf.formatToParts(utcGuess);
    const pMap: Record<string, string> = {};
    for (const p of parts) pMap[p.type] = p.value;

    let localHour = parseInt(pMap.hour, 10);
    if (localHour === 24) localHour = 0;

    const formattedLocalAsUtc = new Date(
      Date.UTC(
        parseInt(pMap.year, 10),
        parseInt(pMap.month, 10) - 1,
        parseInt(pMap.day, 10),
        localHour,
        parseInt(pMap.minute, 10),
        parseInt(pMap.second, 10)
      )
    );

    const offsetMs = formattedLocalAsUtc.getTime() - utcGuess.getTime();
    const actualUtcMs = utcGuess.getTime() - offsetMs;
    return new Date(actualUtcMs).toISOString();
  } catch {
    return utcGuess.toISOString();
  }
}

export function normalizeTimestampToUtc(rawDate: string | number | Date): string {
  try {
    if (typeof rawDate === "string") {
      let str = rawDate.trim();
      // If string is naive ISO like "2026-08-12T09:50:00" without timezone/offset, parse as Europe/Rome
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) {
        return parseLocalTimeToUtc(str, "Europe/Rome");
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      return new Date().toISOString();
    }
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

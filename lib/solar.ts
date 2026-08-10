/**
 * Astronomical Solar Calculator (NOAA Solar Calculation Algorithm)
 * Computes exact sunrise, sunset, and daylight operating windows for any date
 * and geographic coordinates (Eastern Crete: Kouremenos, Tenda, Xerokampos).
 */

export interface SolarWindow {
  date: string; // YYYY-MM-DD
  sunriseUtc: Date;
  sunsetUtc: Date;
  sunriseTime: string; // HH:MM in Europe/Athens
  sunsetTime: string;  // HH:MM in Europe/Athens
  startHour: number;   // Nearest local Athens hour starting after/at dawn (e.g. 6 or 7)
  endHour: number;     // Nearest local Athens hour ending at/before dusk (e.g. 17 in Dec, 20 in Jun)
  daylightDurationHours: number;
}

// Default reference coordinates for Eastern Crete (Palekastro / Cape Sidero / Xerokampos)
export const DEFAULT_CRETE_LAT = 35.19;
export const DEFAULT_CRETE_LON = 26.27;

/**
 * Calculates solar sunrise and sunset for a given UTC Date and Lat/Lon.
 * Returns UTC Date objects for sunrise and sunset.
 */
export function calculateSolarTimes(
  date: Date | string,
  latitude = DEFAULT_CRETE_LAT,
  longitude = DEFAULT_CRETE_LON
): { sunrise: Date; sunset: Date } {
  const d = typeof date === "string" ? new Date(date) : date;
  const safeDate = isNaN(d.getTime()) ? new Date() : d;

  // Day of year calculation
  const startOfYear = new Date(Date.UTC(safeDate.getUTCFullYear(), 0, 1));
  const dayOfYear =
    Math.floor((safeDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // Fractional year (radians)
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);

  // Equation of time (in minutes)
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Zenith angle for sunrise/sunset (90.833° = 90°50' accounting for atmospheric refraction)
  const zenithRad = (90.833 * Math.PI) / 180;
  const latRad = (latitude * Math.PI) / 180;

  // Hour angle calculation
  const cosH =
    (Math.cos(zenithRad) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  // Clamped in case of extreme polar latitudes
  const clampedCosH = Math.max(-1, Math.min(1, cosH));
  const H_deg = (Math.acos(clampedCosH) * 180) / Math.PI;

  // Sunrise and Sunset in minutes from UTC midnight
  const sunriseMinutesUtc = 720 - 4 * longitude - eqtime - 4 * H_deg;
  const sunsetMinutesUtc = 720 - 4 * longitude - eqtime + 4 * H_deg;

  // Construct UTC Dates
  const year = safeDate.getUTCFullYear();
  const month = safeDate.getUTCMonth();
  const day = safeDate.getUTCDate();

  const sunriseDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + Math.round(sunriseMinutesUtc * 60 * 1000));
  const sunsetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + Math.round(sunsetMinutesUtc * 60 * 1000));

  return { sunrise: sunriseDate, sunset: sunsetDate };
}

/**
 * Formats a Date object to HH:MM in Europe/Athens timezone.
 */
function formatAthensHHMM(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Extracts Athens local hour integer (0-23) from a Date.
 */
function getAthensHour(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Athens",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  let hour = 12;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "hour") hour = parseInt(part.value, 10);
    if (part.type === "minute") minute = parseInt(part.value, 10);
  }
  if (hour === 24) hour = 0;
  return { hour, minute };
}

/**
 * Computes the complete Solar Window for a specific date and coordinates in Athens local time.
 */
export function getSolarWindow(
  date: Date | string,
  latitude = DEFAULT_CRETE_LAT,
  longitude = DEFAULT_CRETE_LON
): SolarWindow {
  const { sunrise, sunset } = calculateSolarTimes(date, latitude, longitude);

  const sunriseTime = formatAthensHHMM(sunrise);
  const sunsetTime = formatAthensHHMM(sunset);

  const sunriseAthens = getAthensHour(sunrise);
  const sunsetAthens = getAthensHour(sunset);

  // For windsurfing:
  // startHour: earliest sailable hour after dawn (floor of sunrise hour or exact hour)
  // endHour: latest sailable hour before sunset (floor of sunset hour, e.g. 20:20 -> 20:00)
  const startHour = Math.max(5, Math.min(9, sunriseAthens.hour));
  const endHour = Math.max(16, Math.min(21, sunsetAthens.hour));

  const daylightDurationHours = Math.round(((sunset.getTime() - sunrise.getTime()) / (3600 * 1000)) * 10) / 10;

  const dateStr = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);

  return {
    date: dateStr,
    sunriseUtc: sunrise,
    sunsetUtc: sunset,
    sunriseTime,
    sunsetTime,
    startHour,
    endHour,
    daylightDurationHours,
  };
}

/**
 * Checks whether a given timestamp is during solar daylight hours (between sunrise and sunset).
 * Includes an optional 15-minute civil twilight cushion for early morning rigging and late session exit.
 */
export function isDaylightHour(
  timestamp: Date | string,
  latitude = DEFAULT_CRETE_LAT,
  longitude = DEFAULT_CRETE_LON
): boolean {
  const d = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  if (isNaN(d.getTime())) return true;

  const { sunrise, sunset } = calculateSolarTimes(d, latitude, longitude);

  // 15 min civil twilight buffer
  const TWILIGHT_BUFFER_MS = 15 * 60 * 1000;
  const t = d.getTime();

  return t >= sunrise.getTime() - TWILIGHT_BUFFER_MS && t <= sunset.getTime() + TWILIGHT_BUFFER_MS;
}

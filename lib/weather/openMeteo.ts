export interface OpenMeteoHourlyResponse {
  time: string[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  temperature_2m?: number[];
  cloud_cover?: number[];
  precipitation?: number[];
}

export interface OpenMeteoRawResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly: OpenMeteoHourlyResponse;
  providerModel: string;
}

/**
 * Normalizes Open-Meteo UTC time strings to standard ISO 8601 UTC strings.
 * e.g. "2026-08-09T12:00" -> "2026-08-09T12:00:00.000Z"
 */
export function normalizeUtcTimestamp(rawTime: string): string {
  if (rawTime.endsWith("Z")) return rawTime;
  if (rawTime.includes("+") || rawTime.includes("-", 10)) {
    return new Date(rawTime).toISOString();
  }
  // Standard Open-Meteo format YYYY-MM-DDTHH:mm
  return `${rawTime}:00.000Z`;
}

/**
 * Fetches raw forecast data using the dedicated Open-Meteo ECMWF IFS HRES endpoint.
 * Falls back to Open-Meteo best_match if the dedicated ECMWF endpoint is unreachable.
 */
export async function fetchSpotWeather(
  latitude: number,
  longitude: number,
  forecastDays = 4
): Promise<OpenMeteoRawResponse> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    hourly: [
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "temperature_2m",
      "cloud_cover",
      "precipitation",
    ].join(","),
    wind_speed_unit: "kn",
    timezone: "UTC", // Strict UTC retrieval
    forecast_days: forecastDays.toString(),
  });

  // Dedicated Open-Meteo ECMWF IFS HRES endpoint (0.1° resolution / ~9km)
  const primaryUrl = `https://api.open-meteo.com/v1/ecmwf?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(primaryUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "CreteWindDashboard/1.0",
      },
      next: { revalidate: 900 }, // 15 min cache
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return await fetchFallbackWeather(latitude, longitude, forecastDays);
    }

    const data: OpenMeteoRawResponse = await res.json();
    if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      return await fetchFallbackWeather(latitude, longitude, forecastDays);
    }

    // Normalize all timestamp strings into strict ISO 8601 UTC strings
    data.hourly.time = data.hourly.time.map(normalizeUtcTimestamp);
    data.providerModel = "ECMWF IFS HRES (via Open-Meteo)";

    return data;
  } catch {
    clearTimeout(timeoutId);
    return await fetchFallbackWeather(latitude, longitude, forecastDays);
  }
}

/**
 * Fallback to default Open-Meteo ensemble / best_match if dedicated ECMWF endpoint fails.
 */
async function fetchFallbackWeather(
  latitude: number,
  longitude: number,
  forecastDays: number
): Promise<OpenMeteoRawResponse> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    hourly: [
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "temperature_2m",
      "cloud_cover",
    ].join(","),
    wind_speed_unit: "kn",
    timezone: "UTC",
    forecast_days: forecastDays.toString(),
  });

  const fallbackUrl = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(fallbackUrl, {
    headers: { Accept: "application/json" },
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    throw new Error(`Weather provider unavailable (HTTP ${res.status})`);
  }

  const data: OpenMeteoRawResponse = await res.json();
  if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
    throw new Error("Invalid payload from fallback weather provider");
  }

  data.hourly.time = data.hourly.time.map(normalizeUtcTimestamp);
  data.providerModel = "Open-Meteo Best Match (Fallback)";

  return data;
}

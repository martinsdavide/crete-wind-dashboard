export interface OpenMeteoHourlyResponse {
  time: string[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  temperature_2m?: number[];
  cloud_cover?: number[];
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
}

/**
 * Fetches raw forecast data from Open-Meteo API using ECMWF IFS model.
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
    ].join(","),
    wind_speed_unit: "kn",
    timezone: "Europe/Athens",
    forecast_days: forecastDays.toString(),
    models: "ecmwf_ifs025",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "CreteWindDashboard/1.0",
      },
      next: { revalidate: 900 }, // 15 min cache in Next.js
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // If ECMWF IFS model fails or returns error, retry with default high-resolution best_match
      return await fetchFallbackWeather(latitude, longitude, forecastDays);
    }

    const data: OpenMeteoRawResponse = await res.json();
    if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      throw new Error("Invalid or empty hourly payload from weather API");
    }

    return data;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    // If specific model endpoint fails, attempt best_match fallback before throwing
    try {
      return await fetchFallbackWeather(latitude, longitude, forecastDays);
    } catch {
      throw new Error(
        `Weather API request failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/**
 * Fallback to default Open-Meteo ensemble/best_match if ECMWF specific submodel is unreachable.
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
    timezone: "Europe/Athens",
    forecast_days: forecastDays.toString(),
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    throw new Error(`Fallback Open-Meteo returned status ${res.status}`);
  }

  return (await res.json()) as OpenMeteoRawResponse;
}

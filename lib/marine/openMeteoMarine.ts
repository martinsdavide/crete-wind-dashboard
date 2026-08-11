import { MarineForecast, MarineForecastPoint } from "@/types/marine";
import { MarineForecastProvider } from "./MarineForecastProvider";
import { normalizeUtcTimestamp } from "../weather/openMeteo";

export interface OpenMeteoMarineHourly {
  time: string[];
  wave_height?: (number | null)[];
  wave_direction?: (number | null)[];
  wave_period?: (number | null)[];
  wind_wave_height?: (number | null)[];
  wind_wave_direction?: (number | null)[];
  wind_wave_period?: (number | null)[];
  swell_wave_height?: (number | null)[];
  swell_wave_direction?: (number | null)[];
  swell_wave_period?: (number | null)[];
}

export interface OpenMeteoMarineRawResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation?: number;
  hourly: OpenMeteoMarineHourly;
}

/**
 * Open-Meteo Marine API client fetching ECMWF WAM wave model data.
 */
export class OpenMeteoMarineProvider implements MarineForecastProvider {
  async fetchMarineForecast(
    latitude: number,
    longitude: number,
    forecastDays = 4
  ): Promise<MarineForecast | null> {
    const params = new URLSearchParams({
      latitude: latitude.toFixed(5),
      longitude: longitude.toFixed(5),
      hourly: [
        "wave_height",
        "wave_direction",
        "wave_period",
        "wind_wave_height",
        "wind_wave_direction",
        "wind_wave_period",
        "swell_wave_height",
        "swell_wave_direction",
        "swell_wave_period",
      ].join(","),
      timezone: "UTC",
      cell_selection: "sea", // Ensure nearest marine sea cell is selected
      forecast_days: forecastDays.toString(),
    });

    const url = `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "SpotPilotMarine/1.0",
        },
        next: { revalidate: 900 }, // 15 min cache
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`Marine API returned HTTP ${res.status} for (${latitude}, ${longitude})`);
        return null;
      }

      const data: OpenMeteoMarineRawResponse = await res.json();
      if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
        return null;
      }

      const points: MarineForecastPoint[] = [];
      const times = data.hourly.time;
      const waveHeights = data.hourly.wave_height || [];
      const waveDirs = data.hourly.wave_direction || [];
      const wavePeriods = data.hourly.wave_period || [];
      const swellHeights = data.hourly.swell_wave_height || [];
      const swellDirs = data.hourly.swell_wave_direction || [];
      const swellPeriods = data.hourly.swell_wave_period || [];
      const windWaveHeights = data.hourly.wind_wave_height || [];
      const windWaveDirs = data.hourly.wind_wave_direction || [];
      const windWavePeriods = data.hourly.wind_wave_period || [];

      for (let i = 0; i < times.length; i++) {
        const isoTime = normalizeUtcTimestamp(times[i]);
        points.push({
          timestamp: isoTime,
          waveHeight: waveHeights[i] !== undefined ? waveHeights[i] : null,
          waveDirection: waveDirs[i] !== undefined ? waveDirs[i] : null,
          wavePeriod: wavePeriods[i] !== undefined ? wavePeriods[i] : null,
          swellHeight: swellHeights[i] !== undefined ? swellHeights[i] : null,
          swellDirection: swellDirs[i] !== undefined ? swellDirs[i] : null,
          swellPeriod: swellPeriods[i] !== undefined ? swellPeriods[i] : null,
          windWaveHeight: windWaveHeights[i] !== undefined ? windWaveHeights[i] : null,
          windWaveDirection: windWaveDirs[i] !== undefined ? windWaveDirs[i] : null,
          windWavePeriod: windWavePeriods[i] !== undefined ? windWavePeriods[i] : null,
          provider: "ECMWF WAM (via Open-Meteo)",
        });
      }

      return {
        latitude: data.latitude,
        longitude: data.longitude,
        points,
        providerModel: "ECMWF WAM (via Open-Meteo Marine)",
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Marine API request failed for (${latitude}, ${longitude}):`, err);
      return null;
    }
  }
}

export const defaultMarineProvider = new OpenMeteoMarineProvider();

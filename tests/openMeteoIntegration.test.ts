import { describe, it, expect } from "vitest";
import { normalizeSpotForecast } from "@/lib/weather/normalizeForecast";
import { normalizeUtcTimestamp, OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SPOTS } from "@/config/spots";
import { calculateBestSpotRecommendation, getAthensDateKey } from "@/lib/dailySummary";

describe("Open-Meteo Payload & Timezone Integration", () => {
  it("normalizes Open-Meteo UTC timestamps to strict ISO 8601 UTC strings", () => {
    expect(normalizeUtcTimestamp("2026-08-09T00:00")).toBe("2026-08-09T00:00:00.000Z");
    expect(normalizeUtcTimestamp("2026-08-09T14:30:00.000Z")).toBe("2026-08-09T14:30:00.000Z");
  });

  it("processes a realistic raw Open-Meteo payload without timezone drift", () => {
    // Generate 48 hours of Open-Meteo UTC timestamps (2026-08-09T00:00 to 2026-08-10T23:00)
    const times: string[] = [];
    const windSpeed: number[] = [];
    const windDir: number[] = [];
    const windGusts: number[] = [];
    const temps: number[] = [];
    const clouds: number[] = [];

    const baseDate = new Date("2026-08-09T00:00:00.000Z");

    for (let i = 0; i < 48; i++) {
      const dt = new Date(baseDate.getTime() + i * 3600000);
      const isoPrefix = dt.toISOString().slice(0, 16); // e.g. "2026-08-09T00:00"
      times.push(normalizeUtcTimestamp(isoPrefix));
      windSpeed.push(20);
      windDir.push(315); // NW
      windGusts.push(26);
      temps.push(28);
      clouds.push(10);
    }

    const mockRaw: OpenMeteoRawResponse = {
      latitude: 35.20581,
      longitude: 26.2723,
      generationtime_ms: 0.1,
      utc_offset_seconds: 0,
      timezone: "UTC",
      timezone_abbreviation: "UTC",
      elevation: 5,
      hourly: {
        time: times,
        wind_speed_10m: windSpeed,
        wind_direction_10m: windDir,
        wind_gusts_10m: windGusts,
        temperature_2m: temps,
        cloud_cover: clouds,
      },
      providerModel: "ECMWF IFS HRES (via Open-Meteo)",
    };

    const currentTime = new Date("2026-08-09T12:00:00.000Z"); // 15:00 Athens time
    const forecast = normalizeSpotForecast(SPOTS.kouremenos, mockRaw, currentTime);

    expect(forecast.providerModel).toBe("ECMWF IFS HRES (via Open-Meteo)");
    expect(forecast.hourly.length).toBe(48);

    // Verify all hourly timestamps are strict UTC strings
    forecast.hourly.forEach((h) => {
      expect(h.timestamp).toContain("Z");
    });

    // Check NOW current conditions
    expect(forecast.current.localWind).toBeGreaterThan(20); // NW thermal/orographic boost
    expect(forecast.current.directionLabel).toBe("NW");
    expect(forecast.current.arrowRotation).toBe(135);

    // Check daily summaries
    expect(forecast.days.length).toBeGreaterThanOrEqual(2);
    const day1 = forecast.days[0];
    expect(day1.date).toBe("2026-08-09");
    expect(day1.daytimeMinWind).toBeGreaterThan(0);
    expect(day1.daytimeMaxWind).toBeGreaterThanOrEqual(day1.daytimeMinWind);
    expect(day1.dominantDirection).toBe("NW");

    // Verify Best Spot Recommendation matches Athens date explicitly
    const rec = calculateBestSpotRecommendation(forecast, null, currentTime);
    expect(rec.bestSpot).toBe("kouremenos");
    expect(rec.score).toBeGreaterThan(0);
  });
});

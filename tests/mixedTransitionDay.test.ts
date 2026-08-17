import { describe, it, expect } from "vitest";
import { EasternCreteRegion } from "../regions/eastern-crete";
import { normalizeSpotForecastGeneric } from "../engine/forecast/ForecastNormalizer";
import { RecommendationEngine, classifyRegionalRegimeForHour } from "../engine/recommendation/RecommendationEngine";
import { SpotResult } from "../types/weather";

describe("Mixed Transition Day Scenario — Morning Meltemi to Afternoon SW Thermal", () => {
  it("keeps morning hours unsuitable for Xerokampos, creates afternoon Best Window, derives WESTERLY regime, and recommends Xerokampos for forecast", () => {
    // 24 hours of forecast for 2026-07-15
    // In Europe/Athens (UTC+3):
    // 00:00 - 11:00 Local (21:00 prev day - 08:00 UTC): Light Northerly Meltemi (13 kt, 345° NNW)
    // 12:00 - 23:00 Local (09:00 - 20:00 UTC): SW flow (11 kt, 225° SW) with clear skies
    const time: string[] = [];
    const wind_speed_10m: number[] = [];
    const wind_direction_10m: number[] = [];
    const wind_gusts_10m: number[] = [];
    const temperature_2m: number[] = [];
    const cloud_cover: number[] = [];
    const precipitation: number[] = [];

    // Start at 2026-07-14T21:00:00.000Z (00:00 local time on 2026-07-15 in Europe/Athens UTC+3)
    const baseDate = new Date("2026-07-14T21:00:00.000Z");

    for (let localHour = 0; localHour < 24; localHour++) {
      const d = new Date(baseDate.getTime() + localHour * 3600 * 1000);
      time.push(d.toISOString());

      if (localHour < 12) {
        // Morning Light Meltemi
        wind_speed_10m.push(13);
        wind_direction_10m.push(345);
        wind_gusts_10m.push(16);
      } else {
        // Afternoon SW Thermal Flow
        wind_speed_10m.push(11);
        wind_direction_10m.push(225);
        wind_gusts_10m.push(14);
      }
      temperature_2m.push(28);
      cloud_cover.push(0);
      precipitation.push(0);
    }

    const rawWeather = {
      latitude: 35.19,
      longitude: 26.27,
      generationtime_ms: 10,
      utc_offset_seconds: 10800,
      timezone: "Europe/Athens",
      timezone_abbreviation: "EEST",
      elevation: 10,
      providerModel: "ECMWF IFS HRES",
      hourly: {
        time,
        wind_speed_10m,
        wind_direction_10m,
        wind_gusts_10m,
        temperature_2m,
        cloud_cover,
        precipitation,
      },
    };

    // Pre-calculate hourly regimes as the API pipeline does
    const hourlyRegimes: string[] = [];
    for (let i = 0; i < 24; i++) {
      const { regimeId } = classifyRegionalRegimeForHour(EasternCreteRegion, {
        meanRawWind: wind_speed_10m[i],
        meanDirectionDegrees: wind_direction_10m[i],
        precipitation12hMm: 0,
        currentPrecipitationMm: 0,
        localHour: i,
      });
      hourlyRegimes.push(regimeId);
    }

    // Reference snapshot is previous evening (so 2026-07-15 is evaluated in FORECAST_WINDOW mode)
    const snapshotDate = new Date("2026-07-14T18:00:00.000Z");
    const targetForecastDate = new Date("2026-07-15T10:00:00.000Z");

    const spotsResults: Record<string, SpotResult> = {};
    for (const spot of EasternCreteRegion.spots) {
      const fc = normalizeSpotForecastGeneric(
        spot,
        rawWeather,
        snapshotDate,
        "Europe/Athens",
        hourlyRegimes
      );
      spotsResults[spot.id] = { status: "ok", data: fc };
    }

    const xForecast = (spotsResults["xerokampos"] as any).data;
    expect(xForecast).toBeDefined();

    // 1. Morning hours (08:00 local = index 8) remain UNSUITABLE for Xerokampos due to offshore Meltemi
    const morningHour = xForecast.hourly[8];
    expect(morningHour.eligibility).toBe("UNSUITABLE");
    expect(morningHour.hardGateReason).toBe("OFFSHORE_MELTEMI");
    expect(morningHour.sessionQualityScore).toBe(0);

    // 2. Afternoon hours (15:00 local = index 15) receive thermal reinforcement
    const afternoonHour = xForecast.hourly[15];
    expect(afternoonHour.thermal?.state).toBe("ACTIVE");
    expect(afternoonHour.thermal?.additiveBoostKt).toBeGreaterThan(0);
    expect(afternoonHour.localWind).toBeGreaterThanOrEqual(12);
    expect(afternoonHour.eligibility).not.toBe("UNSUITABLE");
    expect(afternoonHour.sessionQualityScore).toBeGreaterThanOrEqual(70);

    // 3. Best Window for Xerokampos is formed in the afternoon with dominant WESTERLY regime
    const xSummary = xForecast.days.find((d: any) => d.date === "2026-07-15");
    expect(xSummary).toBeDefined();
    expect(xSummary.bestWindow).not.toBeNull();
    expect(xSummary.bestWindow.dominantRegimeId).toBe("WESTERLY");
    expect(parseInt(xSummary.bestWindow.start.split(":")[0], 10)).toBeGreaterThanOrEqual(12);

    // 4. RecommendationEngine evaluates the forecast day and selects Xerokampos in FORECAST_WINDOW mode
    const rec = RecommendationEngine.run(EasternCreteRegion, spotsResults, targetForecastDate);

    expect(rec.bestSpot).toBe("xerokampos");
    expect(rec.bestSpotName).toBe("Xerokampos");
    expect(rec.regime).toBe("WESTERLY");
    expect(rec.regimeLabel).toBe("Westerly Flow");
    expect(rec.mode).toBe("FORECAST_WINDOW");
    expect(rec.bestWindow).not.toBeNull();
    expect(rec.score).toBeGreaterThanOrEqual(70);
  });
});

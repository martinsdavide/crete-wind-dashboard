import { describe, it, expect } from "vitest";
import { GardaLakeRegion } from "@/regions/garda-lake";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";
import { GARDA_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/gardaLakeBindings";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SpotResult, SpotForecast } from "@/types/weather";
import { WeatherObservation } from "@/engine/observations/types";

describe("Observation Pre-Recommendation Fusion Integration Tests", () => {
  const create24hWeather = (speed: number, dir: number): OpenMeteoRawResponse => {
    const time: string[] = [];
    const wind_speed_10m: number[] = [];
    const wind_direction_10m: number[] = [];
    const wind_gusts_10m: number[] = [];
    const temperature_2m: number[] = [];
    const cloud_cover: number[] = [];
    const precipitation: number[] = [];

    const baseDate = new Date("2026-08-12T00:00:00.000Z");

    for (let i = 0; i < 24; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      time.push(d.toISOString());
      wind_speed_10m.push(speed);
      wind_direction_10m.push(dir);
      wind_gusts_10m.push(Math.round(speed * 1.25));
      temperature_2m.push(25);
      cloud_cover.push(10);
      precipitation.push(0);
    }

    return {
      latitude: 45.7,
      longitude: 10.68,
      generationtime_ms: 10,
      utc_offset_seconds: 7200,
      timezone: "Europe/Rome",
      timezone_abbreviation: "CEST",
      elevation: 65,
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
  };

  it("updates recommendation and selects spot with live accelerated wind when fusion runs pre-scoring", () => {
    const refTime = new Date("2026-08-12T13:00:00.000Z"); // 15:00 CEST (Ora afternoon window)
    const rawWeather = create24hWeather(13, 180); // 13 kt Southerly

    const spotsResults: Record<string, SpotResult> = {};

    // 1. Normalize raw forecasts for all Garda spots
    for (const spot of GardaLakeRegion.spots) {
      const forecast: SpotForecast = normalizeSpotForecastGeneric(
        spot,
        rawWeather,
        refTime,
        GardaLakeRegion.timezone,
        "GARDA_ORA",
        null
      );
      spotsResults[spot.id] = { status: "ok", data: forecast };
    }

    // 2. Mock live observation at Torbole T0193: 11.5 m/s (22.4 kt)
    const observations: Record<string, WeatherObservation> = {
      "meteotrentino:T0193": {
        stationId: "meteotrentino:T0193",
        observedAt: "2026-08-12T12:55:00.000Z",
        receivedAt: "2026-08-12T12:56:00.000Z",
        windSpeedMs: 11.5,
        windGustMs: 14.5,
        windDirectionDeg: 185,
        temperatureC: 26.0,
        relativeHumidityPct: 55,
        pressureHpa: 1013.0,
        precipitationMm: 0.0,
        solarRadiationWm2: 800,
        quality: { status: "valid", score: 1.0, reasons: ["OK"] },
      },
    };

    // 3. Run Fusion on Torbole forecast before recommendation
    const torboleData = (spotsResults["torbole"] as any).data;
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      GARDA_LAKE_STATION_BINDINGS["torbole"],
      observations,
      torboleData.current.localWind,
      torboleData.current.localGust,
      torboleData.current.directionDegrees,
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.speedCorrectionKt).toBeGreaterThan(0.5);

    // Apply fusion directly to forecast.current
    torboleData.observationFusion = fusion;
    torboleData.current = {
      ...torboleData.current,
      localWind: fusion.correctedWindSpeedKt,
      localGust: fusion.correctedWindGustKt,
      confidence: Math.min(100, Math.round(torboleData.current.confidence + fusion.confidenceAdjustment * 100)),
    };

    // 4. Run RecommendationEngine on fused conditions
    const recommendation = RecommendationEngine.run(GardaLakeRegion, spotsResults, refTime);

    expect(recommendation.regime).toBe("GARDA_ORA");
    expect(recommendation.bestSpot).toBe("torbole");
    expect(recommendation.score).toBeGreaterThanOrEqual(80);
  });
});

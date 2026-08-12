import { describe, it, expect } from "vitest";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";
import { GARDA_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/gardaLakeBindings";
import { COMO_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/comoLakeBindings";
import { WeatherObservation } from "@/engine/observations/types";

describe("Observation Fusion Engine Tests", () => {
  const refTime = new Date("2026-08-12T14:00:00.000Z");

  it("applies bounded speed correction and confirms Ora at Torbole when T0193 reports stronger wind", () => {
    // Model forecast: 15 kt at 180°
    // Observation at T0193: 10.5 m/s = 20.4 kt at 185° (fresh)
    const observations: Record<string, WeatherObservation> = {
      "meteotrentino:T0193": {
        stationId: "meteotrentino:T0193",
        observedAt: "2026-08-12T13:55:00.000Z",
        receivedAt: "2026-08-12T13:56:00.000Z",
        windSpeedMs: 10.5,
        windGustMs: 13.0,
        windDirectionDeg: 185,
        temperatureC: 26.5,
        relativeHumidityPct: 60,
        pressureHpa: 1014.0,
        precipitationMm: 0.0,
        solarRadiationWm2: 850,
        quality: { status: "valid", score: 1.0, reasons: ["OK"] },
      },
    };

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      GARDA_LAKE_STATION_BINDINGS["torbole"],
      observations,
      15.0, // forecastModelSpeedKt
      18.0, // forecastModelGustKt
      180,  // forecastModelDirDeg
      refTime,
      0     // forecastHorizonHours (NOW)
    );

    expect(fusion.status).toBe("available");
    expect(fusion.observationCoverage).toBeGreaterThan(0.5);
    expect(fusion.speedCorrectionKt).toBeGreaterThan(1.0);
    expect(fusion.speedCorrectionKt).toBeLessThanOrEqual(ObservationFusionEngine.MAX_SPEED_CORRECTION_KT);
    expect(fusion.correctedWindSpeedKt).toBeGreaterThan(15.0);
    expect(fusion.confidenceAdjustment).toBeGreaterThan(0);
    expect(fusion.reasons).toContain("THERMAL_ONSET_CONFIRMED");
    expect(fusion.reasons).toContain("OBSERVED_WIND_ABOVE_FORECAST");
  });

  it("decays speed correction with forecast horizon (+2h vs NOW)", () => {
    const observations: Record<string, WeatherObservation> = {
      "meteotrentino:T0193": {
        stationId: "meteotrentino:T0193",
        observedAt: "2026-08-12T13:55:00.000Z",
        receivedAt: "2026-08-12T13:56:00.000Z",
        windSpeedMs: 11.0,
        windGustMs: 14.0,
        windDirectionDeg: 180,
        temperatureC: 25.0,
        relativeHumidityPct: 55,
        pressureHpa: 1013.0,
        precipitationMm: 0.0,
        solarRadiationWm2: 800,
        quality: { status: "valid", score: 1.0, reasons: ["OK"] },
      },
    };

    const fusionNow = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      GARDA_LAKE_STATION_BINDINGS["torbole"],
      observations,
      14.0,
      17.0,
      180,
      refTime,
      0 // NOW
    );

    const fusion2h = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      GARDA_LAKE_STATION_BINDINGS["torbole"],
      observations,
      14.0,
      17.0,
      180,
      refTime,
      2.0 // +2 hours
    );

    expect(fusionNow.speedCorrectionKt).toBeGreaterThan(fusion2h.speedCorrectionKt);
  });

  it("confirms upstream northerly flow for Dervio using Colico observations", () => {
    const observations: Record<string, WeatherObservation> = {
      "lombardia:colico": {
        stationId: "lombardia:colico",
        observedAt: "2026-08-12T13:52:00.000Z",
        receivedAt: "2026-08-12T13:53:00.000Z",
        windSpeedMs: 11.5, // 22.4 kt
        windGustMs: 15.0,
        windDirectionDeg: 15,
        temperatureC: 22.0,
        relativeHumidityPct: 50,
        pressureHpa: 1015.0,
        precipitationMm: 0.0,
        solarRadiationWm2: null,
        quality: { status: "valid", score: 1.0, reasons: ["OK"] },
      },
    };

    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "dervio",
      COMO_LAKE_STATION_BINDINGS["dervio"],
      observations,
      20.0,
      25.0,
      15,
      refTime,
      0
    );

    expect(fusion.status).toBe("available");
    expect(fusion.regimeEvidence.northerly).toBeGreaterThan(0.7);
    expect(fusion.reasons).toContain("NORTHERLY_FLOW_CONFIRMED");
  });

  it("extracts overnight rain evidence at Valmadrera", () => {
    const observations: Record<string, WeatherObservation> = {
      "lombardia:valmadrera": {
        stationId: "lombardia:valmadrera",
        observedAt: "2026-08-12T06:00:00.000Z",
        receivedAt: "2026-08-12T06:01:00.000Z",
        windSpeedMs: null,
        windGustMs: null,
        windDirectionDeg: null,
        temperatureC: 18.5,
        relativeHumidityPct: 85,
        pressureHpa: null,
        precipitationMm: 8.5,
        solarRadiationWm2: null,
        quality: { status: "valid", score: 1.0, reasons: ["OK"] },
      },
    };

    const earlyMorningTime = new Date("2026-08-12T06:00:00.000Z");
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "valmadrera-pare",
      COMO_LAKE_STATION_BINDINGS["valmadrera-pare"],
      observations,
      12.0,
      15.0,
      35,
      earlyMorningTime,
      0
    );

    expect(fusion.regimeEvidence.rainBoost).toBeGreaterThan(0.5);
    expect(fusion.reasons).toContain("OVERNIGHT_RAIN_8.5MM");
  });

  it("gracefully falls back with neutral results when all observations are missing or unavailable", () => {
    const fusion = ObservationFusionEngine.fuseSpotForecast(
      "torbole",
      GARDA_LAKE_STATION_BINDINGS["torbole"],
      {},
      16.0,
      20.0,
      180,
      refTime,
      0
    );

    expect(fusion.status).toBe("unavailable");
    expect(fusion.correctedWindSpeedKt).toBe(16.0);
    expect(fusion.speedCorrectionKt).toBe(0);
    expect(fusion.confidenceAdjustment).toBe(0);
  });
});

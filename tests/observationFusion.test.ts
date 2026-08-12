import { describe, it, expect } from "vitest";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";
import { ObservationFeatureExtractor } from "@/engine/observations/ObservationFeatureExtractor";
import { GARDA_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/gardaLakeBindings";
import { COMO_LAKE_STATION_BINDINGS } from "@/engine/observations/bindings/comoLakeBindings";
import { WeatherObservation, SpotStationBinding } from "@/engine/observations/types";

describe("Observation Fusion Engine Tests", () => {
  const refTime = new Date("2026-08-12T14:00:00.000Z");

  describe("Meteorological Vector Averaging", () => {
    it("cancels speed to near zero when two equal opposing winds (North vs South) are vector-averaged", () => {
      const samples = [
        { speed: 20, directionDeg: 0, weight: 1.0 },   // 20 kt from North (0°) -> v = -20, u = 0
        { speed: 20, directionDeg: 180, weight: 1.0 }, // 20 kt from South (180°) -> v = +20, u = 0
      ];

      const result = ObservationFeatureExtractor.calculateMeteorologicalVectorMean(samples);
      expect(result).not.toBeNull();
      // Opposing winds must vectorially cancel out to 0 kt
      expect(result?.meanSpeed).toBe(0);
    });

    it("averages orthogonal winds (20 kt North + 20 kt East) correctly to ~20 kt from NE (45°)", () => {
      const samples = [
        { speed: 20, directionDeg: 0, weight: 1.0 },  // North
        { speed: 20, directionDeg: 90, weight: 1.0 }, // East
      ];

      const result = ObservationFeatureExtractor.calculateMeteorologicalVectorMean(samples);
      expect(result).not.toBeNull();
      expect(result?.meanDirectionDeg).toBe(45);
      expect(result?.meanSpeed).toBeCloseTo(14.1, 0.5);
    });
  });

  describe("Role Isolation & Allowed Effects", () => {
    it("does not allow mountain station (Tremalzo) to alter Torbole shoreline wind speed", () => {
      // Model forecast at Torbole: 15 kt S
      // Tremalzo reports 35 kt N at mountain altitude
      // Torbole T0193 is unavailable
      const observations: Record<string, WeatherObservation> = {
        "meteotrentino:T0354": {
          stationId: "meteotrentino:T0354",
          observedAt: "2026-08-12T13:55:00.000Z",
          receivedAt: "2026-08-12T13:56:00.000Z",
          windSpeedMs: 18.0, // 35 kt
          windGustMs: 25.0,
          windDirectionDeg: 350,
          temperatureC: 12.0,
          relativeHumidityPct: 40,
          pressureHpa: 840.0,
          precipitationMm: 0.0,
          solarRadiationWm2: null,
          quality: { status: "valid", score: 1.0, reasons: ["OK"] },
        },
      };

      const fusion = ObservationFusionEngine.fuseSpotForecast(
        "torbole",
        GARDA_LAKE_STATION_BINDINGS["torbole"],
        observations,
        15.0, // model speed
        18.0, // model gust
        180,  // model dir
        refTime,
        0
      );

      // Tremalzo has role 'mountain' and allowedEffects: ['regime-detection', 'confidence']
      // It MUST NOT alter Torbole's local wind speed!
      expect(fusion.speedCorrectionKt).toBe(0);
      expect(fusion.correctedWindSpeedKt).toBe(15.0);
    });

    it("enforces per-binding maxAgeMinutes", () => {
      // Station observation is 35 minutes old
      // Binding with maxAgeMinutes: 30 should reject it
      const observations: Record<string, WeatherObservation> = {
        "lombardia:colico": {
          stationId: "lombardia:colico",
          observedAt: "2026-08-12T13:25:00.000Z", // 35 min old
          receivedAt: "2026-08-12T13:26:00.000Z",
          windSpeedMs: 12.0,
          windGustMs: 15.0,
          windDirectionDeg: 15,
          temperatureC: 22.0,
          relativeHumidityPct: 50,
          pressureHpa: 1015.0,
          precipitationMm: 0.0,
          solarRadiationWm2: null,
          quality: { status: "valid", score: 0.8, reasons: ["OK"] },
        },
      };

      const bindings: SpotStationBinding[] = [
        {
          stationId: "lombardia:colico",
          role: "spot-local",
          baseWeight: 0.9,
          maxAgeMinutes: 30, // 30 min limit
          parameters: ["wind_speed", "wind_direction"],
          allowedEffects: ["speed-bias", "current-condition"],
        },
      ];

      const features = ObservationFeatureExtractor.extractFeatures(
        bindings,
        observations,
        15.0,
        15,
        refTime
      );

      // 35 min old observation exceeds 30 min limit -> coverage is 0
      expect(features.observationCoverage).toBe(0);
      expect(features.weightedWindSpeedKt).toBeNull();
    });
  });

  describe("Torbole Ora Confirmation", () => {
    it("applies bounded speed correction and confirms Ora at Torbole when T0193 reports stronger wind", () => {
      const observations: Record<string, WeatherObservation> = {
        "meteotrentino:T0193": {
          stationId: "meteotrentino:T0193",
          observedAt: "2026-08-12T13:55:00.000Z",
          receivedAt: "2026-08-12T13:56:00.000Z",
          windSpeedMs: 10.5, // 20.4 kt
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
        15.0,
        18.0,
        180,
        refTime,
        0 // NOW
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
  });

  describe("Valmadrera Overnight Rain Evidence", () => {
    it("extracts overnight rain evidence only when direction is compatible with northerly flow", () => {
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
        35, // North-East morning flow (compatible)
        earlyMorningTime,
        0
      );

      expect(fusion.regimeEvidence.rainBoost).toBeGreaterThan(0.5);
      expect(fusion.reasons).toContain("OVERNIGHT_RAIN_8.5MM");
    });
  });
});

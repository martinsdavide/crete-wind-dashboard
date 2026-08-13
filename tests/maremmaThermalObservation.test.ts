import { describe, it, expect } from "vitest";
import { MaremmaRegion } from "@/regions/maremma";
import { ThermalEffectEvaluator } from "@/engine/forecast/ThermalEffectEvaluator";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { ObservationFeatureExtractor } from "@/engine/observations/ObservationFeatureExtractor";
import { ObservationFusionEngine } from "@/engine/observations/ObservationFusionEngine";
import { SpotStationBinding } from "@/engine/observations/types";

describe("Maremma Thermal and Observation Integration Tests", () => {
  const marinaSpot = MaremmaRegion.spots.find((s) => s.id === "marina-di-grosseto")!;
  const talamoneSpot = MaremmaRegion.spots.find((s) => s.id === "talamone")!;

  describe("Unit Tests for ThermalEffectEvaluator", () => {
    it("Scenario A: Marina thermal develops under optimal summer afternoon conditions", () => {
      const refTime = new Date("2026-07-15T13:00:00Z"); // 15:00 Rome
      const evalRes = ThermalEffectEvaluator.evaluate(
        marinaSpot,
        refTime,
        "NW",
        10, // moderate synoptic
        10, // clear sky
        "Europe/Rome"
      );

      expect(evalRes.active).toBe(true);
      expect(evalRes.state).toBe("ACTIVE");
      expect(evalRes.correctionMode).toBe("ADDITIVE");
      expect(evalRes.additiveBoostKt).toBeGreaterThanOrEqual(4.0);
      expect(evalRes.strength).toBeGreaterThan(0.7);
    });

    it("Scenario B: Marina cloudy day reduces thermal strength and reports cloud suppression", () => {
      const refTime = new Date("2026-07-15T13:00:00Z"); // 15:00 Rome
      const evalRes = ThermalEffectEvaluator.evaluate(
        marinaSpot,
        refTime,
        "NW",
        10,
        90, // high cloud cover
        "Europe/Rome"
      );

      expect(evalRes.strength).toBeLessThan(0.3);
      expect(evalRes.limitingFactors).toContain("THERMAL_CLOUD_SUPPRESSION");
    });

    it("Scenario C: Talamone reinforced Maestrale combines hybrid corrections", () => {
      const refTime = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome
      const evalRes = ThermalEffectEvaluator.evaluate(
        talamoneSpot,
        refTime,
        "NW",
        12,
        0,
        "Europe/Rome"
      );

      expect(evalRes.state).toBe("ACTIVE");
      expect(evalRes.correctionMode).toBe("HYBRID");
      expect(evalRes.multiplicativeBoost).toBeGreaterThan(0.15);
      expect(evalRes.additiveBoostKt).toBeGreaterThan(2.5);
    });

    it("Scenario D: Strong synoptic Maestrale suppresses thermal contribution and avoids double counting", () => {
      const refTime = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome
      const evalRes = ThermalEffectEvaluator.evaluate(
        talamoneSpot,
        refTime,
        "NW",
        26, // excessive synoptic wind
        0,
        "Europe/Rome"
      );

      expect(evalRes.strength).toBe(0);
      expect(evalRes.active).toBe(false);
      expect(evalRes.limitingFactors).toContain("THERMAL_SYNOPTIC_SUPPRESSION");
    });

    it("Scenario E: Incompatible wind direction yields low thermal strength and no correction", () => {
      const refTime = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome
      const evalRes = ThermalEffectEvaluator.evaluate(
        talamoneSpot,
        refTime,
        "E", // east wind (incompatible)
        10,
        0,
        "Europe/Rome"
      );

      expect(evalRes.strength).toBeLessThan(0.15);
      expect(evalRes.active).toBe(true);
      expect(evalRes.multiplicativeBoost).toBeLessThan(0.05);
      expect(evalRes.additiveBoostKt).toBeLessThan(1.0);
    });

    it("evaluates thermal lifecycle transitions correctly", () => {
      const morningTime = new Date("2026-07-15T09:00:00Z"); // 11:00 Rome
      const afternoonTime = new Date("2026-07-15T13:00:00Z"); // 15:00 Rome
      const eveningTime = new Date("2026-07-15T16:00:00Z"); // 18:00 Rome

      const mRes = ThermalEffectEvaluator.evaluate(marinaSpot, morningTime, "NW", 10, 0, "Europe/Rome");
      const aRes = ThermalEffectEvaluator.evaluate(marinaSpot, afternoonTime, "NW", 10, 0, "Europe/Rome");
      const eRes = ThermalEffectEvaluator.evaluate(marinaSpot, eveningTime, "NW", 10, 0, "Europe/Rome");

      expect(mRes.state).toBe("BUILDING");
      expect(aRes.state).toBe("ACTIVE");
      expect(eRes.state).toBe("DECAYING");
    });
  });

  describe("Observation Feature Extraction & Fusion", () => {
    const bindings: SpotStationBinding[] = [
      {
        stationId: "siar:marina_grosseto",
        role: "spot-local",
        baseWeight: 0.90,
        maxAgeMinutes: 30,
        parameters: ["wind_speed", "wind_direction"],
        allowedEffects: ["current-condition", "speed-bias"],
      },
    ];

    it("Scenario F: Stale station observation is ignored during extraction", () => {
      const refTime = new Date();
      const staleTime = new Date(refTime.getTime() - 40 * 60 * 1000); // 40 minutes ago (max age is 30)

      const observations = {
        "siar:marina_grosseto": {
          stationId: "siar:marina_grosseto",
          observedAt: staleTime.toISOString(),
          windSpeedMs: 12.0,
          windGustMs: 15.0,
          windDirectionDeg: 270,
          temperatureC: 28,
          precipitationMm: 0,
          quality: { status: "valid" as const, score: 1.0, reasons: [] },
        },
      } as any;

      const features = ObservationFeatureExtractor.extractFeatures(
        bindings,
        observations,
        15,
        270,
        refTime
      );

      expect(features.weightedWindSpeedKt).toBeNull();
      expect(features.totalTrustedWeight).toBe(0);
    });

    it("Scenario G: Conflicting observations decrease fusion confidence", () => {
      const refTime = new Date();
      const stationBindings: SpotStationBinding[] = [
        {
          stationId: "siar:marina_grosseto",
          role: "spot-local",
          baseWeight: 0.90,
          maxAgeMinutes: 30,
          parameters: ["wind_speed", "wind_direction"],
          allowedEffects: ["current-condition", "speed-bias"],
        },
        {
          stationId: "siar:talamone_sentinel",
          role: "spot-local",
          baseWeight: 0.90,
          maxAgeMinutes: 30,
          parameters: ["wind_speed", "wind_direction"],
          allowedEffects: ["current-condition", "speed-bias"],
        },
      ];

      const observations = {
        "siar:marina_grosseto": {
          stationId: "siar:marina_grosseto",
          observedAt: refTime.toISOString(),
          windSpeedMs: 12.0, // ~23 kt
          windGustMs: 15.0,
          windDirectionDeg: 270,
          temperatureC: 28,
          precipitationMm: 0,
          quality: { status: "valid" as const, score: 1.0, reasons: [] },
        },
        "siar:talamone_sentinel": {
          stationId: "siar:talamone_sentinel",
          observedAt: refTime.toISOString(),
          windSpeedMs: 2.0, // ~4 kt (strongly conflicting)
          windGustMs: 3.0,
          windDirectionDeg: 90,
          temperatureC: 28,
          precipitationMm: 0,
          quality: { status: "valid" as const, score: 1.0, reasons: [] },
        },
      } as any;

      const fusion = ObservationFusionEngine.fuseSpotForecast(
        "marina-di-grosseto",
        stationBindings,
        observations,
        12, // forecast model wind
        15,
        270,
        refTime
      );

      expect(fusion.status).toBe("available");
      expect(fusion.confidenceAdjustment).toBeLessThan(0); // penalized due to speed and direction discrepancy
      expect(fusion.reasons).toContain("OBSERVATION_SPEED_DISCREPANCY");
    });
  });
});

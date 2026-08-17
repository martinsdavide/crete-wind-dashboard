import { describe, it, expect } from "vitest";
import { EasternCreteSpots } from "../regions/eastern-crete/spots";
import { EasternCreteRegion } from "../regions/eastern-crete";
import { ThermalEffectEvaluator } from "../engine/forecast/ThermalEffectEvaluator";
import { normalizeHourlyPoint, renormalizeHourWithObservation } from "../engine/forecast/ForecastNormalizer";
import { resolveMinimumPlaningWind } from "../lib/windThresholds";
import { ObservationBindingRegistry } from "../engine/observations/ObservationBindingRegistry";
import { generateRecommendationExplanation } from "../engine/explanation/ExplanationEngine";
import { HourlyWind } from "../types/weather";

describe("Xerokampos Summer Thermal Reinforcement Specification", () => {
  const xerokampos = EasternCreteSpots.find((s) => s.id === "xerokampos")!;

  it("0. has valid spot and generic binding registry configuration", () => {
    expect(xerokampos).toBeDefined();
    expect(xerokampos.minPlaningWind).toBe(12);

    const bindings = ObservationBindingRegistry.getBindingsForRegion("eastern-crete");
    expect(bindings).toBeDefined();
    expect(bindings?.xerokampos).toBeDefined();
    expect(bindings?.xerokampos[0].role).toBe("thermal-sentinel");
    expect(bindings?.xerokampos[0].allowedEffects).toEqual(["confidence", "thermal-context", "regime-detection"]);

    expect(resolveMinimumPlaningWind(xerokampos)).toBe(12);
  });

  it("Case 1: July, 15:00, SW, 11 kt, clear sky -> ACTIVE thermal, high strength, local forecast ~22–25 kt", () => {
    // 2026-07-15T15:00:00+03:00 (12:00 UTC) -> 15:00 local time in Europe/Athens
    const timestamp = "2026-07-15T12:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 11,
      windGust: 14,
      windDirection: 225, // SW
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    expect(normalized.thermal).toBeDefined();
    expect(normalized.thermal?.state).toBe("ACTIVE");
    expect(normalized.thermal?.strength).toBeGreaterThanOrEqual(0.8);
    // Local wind should be in the ~22-25 kt range (model 11 * 1.1 + ~14 kt additive)
    expect(normalized.localWind).toBeGreaterThanOrEqual(22);
    expect(normalized.localWind).toBeLessThanOrEqual(26);
    expect(normalized.baseCorrectedWindKt).toBeCloseTo(12.7, 1);
    expect(normalized.preObservationLocalWindKt).toBe(normalized.localWind);
    expect(normalized.reasonCodes).toContain("THERMAL_ACTIVE");
    expect(normalized.reasonCodes).toContain("THERMAL_SEASON_SUPPORT");
  });

  it("Case 2: July, 15:00, SW, 11 kt, heavy cloud (90%) -> thermal suppressed, no false 20–25 kt prediction", () => {
    const timestamp = "2026-07-15T12:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 11,
      windGust: 14,
      windDirection: 225,
      cloudCover: 90,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    expect(normalized.thermal?.strength).toBeLessThan(0.25);
    expect(normalized.localWind).toBeLessThan(16);
    expect(normalized.reasonCodes).toContain("THERMAL_CLOUD_SUPPRESSION");
  });

  it("Case 3: July, 09:00, SW, 11 kt -> thermal ABSENT, no afternoon correction", () => {
    // 09:00 local time (06:00 UTC)
    const timestamp = "2026-07-15T06:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 11,
      windGust: 14,
      windDirection: 225,
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    expect(normalized.thermal?.state).toBe("ABSENT");
    expect(normalized.thermal?.additiveBoostKt).toBe(0);
    expect(normalized.localWind).toBeCloseTo(12.1, 1);
  });

  it("Case 4: July, 12:00, SW, 11 kt -> BUILDING, partial correction", () => {
    // 12:00 local time (09:00 UTC)
    const timestamp = "2026-07-15T09:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 11,
      windGust: 14,
      windDirection: 225,
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    expect(normalized.thermal?.state).toBe("BUILDING");
    expect(normalized.thermal?.additiveBoostKt).toBeGreaterThan(5);
    expect(normalized.thermal?.additiveBoostKt).toBeLessThan(14);
    expect(normalized.reasonCodes).toContain("THERMAL_BUILDING");
  });

  it("Case 5: July, 19:00, SW, 11 kt -> DECAYING, correction below afternoon peak", () => {
    // 19:00 local time (16:00 UTC)
    const timestamp = "2026-07-15T16:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 11,
      windGust: 14,
      windDirection: 225,
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    expect(normalized.thermal?.state).toBe("DECAYING");
    expect(normalized.thermal?.additiveBoostKt).toBeLessThan(6);
    expect(normalized.reasonCodes).toContain("THERMAL_DECAYING");
  });

  it("Case 6: July, 15:00, SW, 20 kt -> synoptic suppression, no excessive inflation", () => {
    const timestamp = "2026-07-15T12:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 20,
      windGust: 25,
      windDirection: 225,
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    // High synoptic wind suppresses pure local thermal circulation
    expect(normalized.thermal?.additiveBoostKt).toBeLessThanOrEqual(4);
    expect(normalized.localWind).toBeLessThanOrEqual(27);
  });

  it("Case 7: NNE Meltemi -> UNSUITABLE, OFFSHORE_MELTEMI", () => {
    const timestamp = "2026-07-15T12:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 18,
      windGust: 24,
      windDirection: 30, // NNE
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "MELTEMI_STRONG",
      "Europe/Athens"
    );

    expect(normalized.eligibility).toBe("UNSUITABLE");
    expect(normalized.eligibilityReason).toBe("OFFSHORE_MELTEMI");
    expect(normalized.hardGateReason).toBe("OFFSHORE_MELTEMI");
    expect(normalized.reasonCodes).toContain("OFFSHORE_MELTEMI");
  });

  it("Case 8: NW Meltemi -> UNSUITABLE, OFFSHORE_MELTEMI without thermal override", () => {
    const timestamp = "2026-07-15T12:00:00.000Z";
    const point = {
      timestamp,
      windSpeed: 16,
      windGust: 20,
      windDirection: 315, // NW
      cloudCover: 0,
    };

    const normalized = normalizeHourlyPoint(
      xerokampos,
      point,
      new Date("2026-07-15T00:00:00.000Z"),
      "MELTEMI_MODERATE",
      "Europe/Athens"
    );

    expect(normalized.eligibility).toBe("UNSUITABLE");
    expect(normalized.eligibilityReason).toBe("OFFSHORE_MELTEMI");
  });

  it("Case 9: One-hour interval with large requested boost increase -> limited by buildRateLimitKtPerHour", () => {
    const prevEval = {
      strength: 0.2,
      boost: 0,
      active: true,
      factors: { season: 1, time: 0.2, direction: 1, synopticWind: 1, solar: 1 },
      state: "BUILDING" as const,
      confidence: 1.0,
      correctionMode: "HYBRID" as const,
      additiveBoostKt: 2.0,
      multiplicativeBoost: 0,
    };

    // Evaluated at 15:00 where raw boost would be 14 kt
    const res = ThermalEffectEvaluator.evaluate(
      xerokampos,
      "2026-07-15T12:00:00.000Z",
      "SW",
      11,
      0,
      "Europe/Athens",
      undefined,
      "WESTERLY",
      prevEval,
      1.0 // 1 hour elapsed
    );

    // With build rate limit of 5 kt/hr, 2.0 + 5.0 = 7.0 kt max
    expect(res.additiveBoostKt).toBe(7.0);
  });

  it("Case 10: Two-hour interval -> allowed change scaled by two hours", () => {
    const prevEval = {
      strength: 0.2,
      boost: 0,
      active: true,
      factors: { season: 1, time: 0.2, direction: 1, synopticWind: 1, solar: 1 },
      state: "BUILDING" as const,
      confidence: 1.0,
      correctionMode: "HYBRID" as const,
      additiveBoostKt: 2.0,
      multiplicativeBoost: 0,
    };

    const res = ThermalEffectEvaluator.evaluate(
      xerokampos,
      "2026-07-15T12:00:00.000Z",
      "SW",
      11,
      0,
      "Europe/Athens",
      undefined,
      "WESTERLY",
      prevEval,
      2.0 // 2 hours elapsed -> build limit = 10 kt
    );

    // 2.0 + 10.0 = 12.0 kt
    expect(res.additiveBoostKt).toBe(12.0);
  });

  it("Case 11: Duplicate or invalid timestamp -> safe fallback without explosion", () => {
    const prevEval = {
      strength: 0.8,
      boost: 0,
      active: true,
      factors: { season: 1, time: 1, direction: 1, synopticWind: 1, solar: 1 },
      state: "ACTIVE" as const,
      confidence: 1.0,
      correctionMode: "HYBRID" as const,
      additiveBoostKt: 10.0,
      multiplicativeBoost: 0,
    };

    const res = ThermalEffectEvaluator.evaluate(
      xerokampos,
      "2026-07-15T12:00:00.000Z",
      "SW",
      11,
      0,
      "Europe/Athens",
      undefined,
      "WESTERLY",
      prevEval,
      0 // 0 hours (duplicate timestamp)
    );

    expect(res.additiveBoostKt).toBeGreaterThanOrEqual(0);
    expect(res.additiveBoostKt).toBeLessThanOrEqual(14);
  });

  it("Case 12: Fresh supporting thermal-sentinel observation -> confidence increases without duplicating wind boost", () => {
    const baseHour: HourlyWind = {
      timestamp: "2026-07-15T12:00:00.000Z",
      modelWind: 11,
      modelGust: 14,
      directionDegrees: 225,
      directionLabel: "SW",
      arrowRotation: 45,
      localWind: 24,
      localGust: 28,
      correctionFactor: 1.1,
      baseCorrectedWindKt: 12.1,
      preObservationLocalWindKt: 24,
      confidence: 70,
      confidenceLevel: "HIGH",
      eligibility: "IDEAL",
      waterState: "BUMP_AND_JUMP",
      spotWindQuality: 95,
      directionQuality: 100,
      preferenceScore: 90,
      sessionQualityScore: 92,
      score: 92,
      classification: "GREAT",
      condition: "EXCELLENT",
      thermal: {
        state: "ACTIVE",
        strength: 0.9,
        confidence: 0.70,
        additiveBoostKt: 12,
        multiplicativeBoost: 0,
      },
      observationFusion: {
        status: "available",
        windFusionStatus: "available",
        contextFusionStatus: "available",
        windObservationUsed: false, // sentinel does not overwrite wind
        directionObservationUsed: false,
        regimeObservationUsed: true,
        lakeStateObservationUsed: false,
        latestObservedAt: "2026-07-15T11:45:00.000Z",
        correctedWindSpeedKt: 24,
        correctedWindGustKt: 28,
        correctedWindDirectionDeg: 225,
        speedCorrectionKt: 0,
        directionCorrectionDeg: 0,
        confidenceAdjustment: 0.15,
        observationCoverage: 0.85,
        coverage: {
          overall: 0.85,
          windSpeed: 0,
          windGust: 0,
          windDirection: 0,
          currentCondition: 0,
          regimeDetection: 0.85,
          thermalContext: 0.85,
          rainContext: 0,
          confidence: 0.85,
        },
        contributors: [
          {
            stationId: "greece:XEROKAMPOS",
            stationName: "Xerokampos – Thermal Sentinel",
            role: "thermal-sentinel",
            weight: 0.85,
            qualityScore: 1.0,
            observedWindKt: 22,
            observedGustKt: 26,
            observedDirectionDeg: 220,
            observedAt: "2026-07-15T11:45:00.000Z",
            ageMinutes: 15,
            effectsApplied: ["confidence", "thermal-context"],
          },
        ],
        reasons: ["THERMAL_SUPPORT_CONFIRMED"],
      } as any,
    };

    const renormalized = renormalizeHourWithObservation(
      xerokampos,
      baseHour,
      24, // Fused wind remains 24 kt
      28,
      225,
      "WESTERLY",
      "Europe/Athens"
    );

    // Confidence increases generically
    expect(renormalized.thermal?.confidence).toBeGreaterThan(0.70);
    // Wind is NOT doubled or modified
    expect(renormalized.localWind).toBe(24);
    expect(renormalized.reasonCodes).toContain("THERMAL_OBSERVATION_SUPPORT");
  });

  it("Case 13: Fresh contradictory observation -> confidence decreases", () => {
    const baseHour: HourlyWind = {
      timestamp: "2026-07-15T12:00:00.000Z",
      modelWind: 11,
      modelGust: 14,
      directionDegrees: 225,
      directionLabel: "SW",
      arrowRotation: 45,
      localWind: 24,
      localGust: 28,
      correctionFactor: 1.1,
      confidence: 70,
      confidenceLevel: "HIGH",
      eligibility: "IDEAL",
      waterState: "BUMP_AND_JUMP",
      spotWindQuality: 95,
      directionQuality: 100,
      preferenceScore: 90,
      sessionQualityScore: 92,
      score: 92,
      classification: "GREAT",
      condition: "EXCELLENT",
      thermal: {
        state: "ACTIVE",
        strength: 0.9,
        confidence: 0.70,
        additiveBoostKt: 12,
        multiplicativeBoost: 0,
      },
      observationFusion: {
        status: "partial",
        windFusionStatus: "degraded",
        contextFusionStatus: "available",
        windObservationUsed: false,
        directionObservationUsed: false,
        regimeObservationUsed: true,
        lakeStateObservationUsed: false,
        latestObservedAt: "2026-07-15T11:45:00.000Z",
        correctedWindSpeedKt: 24,
        correctedWindGustKt: 28,
        correctedWindDirectionDeg: 225,
        speedCorrectionKt: 0,
        directionCorrectionDeg: 0,
        confidenceAdjustment: -0.20,
        observationCoverage: 0.85,
        coverage: {
          overall: 0.85,
          windSpeed: 0,
          windGust: 0,
          windDirection: 0,
          currentCondition: 0,
          regimeDetection: 0.85,
          thermalContext: 0.85,
          rainContext: 0,
          confidence: 0.85,
        },
        contributors: [],
        reasons: ["THERMAL_CONTRADICTION"],
      } as any,
    };

    const renormalized = renormalizeHourWithObservation(
      xerokampos,
      baseHour,
      24,
      28,
      225,
      "WESTERLY",
      "Europe/Athens"
    );

    expect(renormalized.thermal?.confidence).toBeLessThan(0.70);
    expect(renormalized.reasonCodes).toContain("THERMAL_OBSERVATION_CONTRADICTION");
  });

  it("Case 14: Stale observation -> ignored and exposes OBSERVATION_STALE code", () => {
    const baseHour: HourlyWind = {
      timestamp: "2026-07-15T12:00:00.000Z",
      modelWind: 11,
      modelGust: 14,
      directionDegrees: 225,
      directionLabel: "SW",
      arrowRotation: 45,
      localWind: 24,
      localGust: 28,
      correctionFactor: 1.1,
      confidence: 70,
      confidenceLevel: "HIGH",
      eligibility: "IDEAL",
      waterState: "BUMP_AND_JUMP",
      spotWindQuality: 95,
      directionQuality: 100,
      preferenceScore: 90,
      sessionQualityScore: 92,
      score: 92,
      classification: "GREAT",
      condition: "EXCELLENT",
      thermal: {
        state: "ACTIVE",
        strength: 0.9,
        confidence: 0.70,
        additiveBoostKt: 12,
        multiplicativeBoost: 0,
      },
      observationFusion: {
        status: "stale",
        windFusionStatus: "stale",
        contextFusionStatus: "unavailable",
        windObservationUsed: false,
        directionObservationUsed: false,
        regimeObservationUsed: false,
        lakeStateObservationUsed: false,
        latestObservedAt: "2026-07-15T09:00:00.000Z",
        correctedWindSpeedKt: 24,
        correctedWindGustKt: 28,
        correctedWindDirectionDeg: 225,
        speedCorrectionKt: 0,
        directionCorrectionDeg: 0,
        confidenceAdjustment: 0,
        observationCoverage: 0,
        coverage: {
          overall: 0,
          windSpeed: 0,
          windGust: 0,
          windDirection: 0,
          currentCondition: 0,
          regimeDetection: 0,
          thermalContext: 0,
          rainContext: 0,
          confidence: 0,
        },
        contributors: [],
        reasons: ["STALE_OBSERVATION"],
      } as any,
    };

    const renormalized = renormalizeHourWithObservation(
      xerokampos,
      baseHour,
      24,
      28,
      225,
      "WESTERLY",
      "Europe/Athens"
    );

    expect(renormalized.thermal?.confidence).toBe(0.70);
    expect(renormalized.reasonCodes).toContain("OBSERVATION_STALE");
  });

  it("Case 15: Valid observation above 27 kt -> preserved and not artificially truncated by model thermal cap", () => {
    const baseHour: HourlyWind = {
      timestamp: "2026-07-15T12:00:00.000Z",
      modelWind: 11,
      modelGust: 14,
      directionDegrees: 225,
      directionLabel: "SW",
      arrowRotation: 45,
      localWind: 24,
      localGust: 28,
      correctionFactor: 1.1,
      baseCorrectedWindKt: 12.1,
      preObservationLocalWindKt: 24,
      confidence: 70,
      confidenceLevel: "HIGH",
      eligibility: "IDEAL",
      waterState: "BUMP_AND_JUMP",
      spotWindQuality: 95,
      directionQuality: 100,
      preferenceScore: 90,
      sessionQualityScore: 92,
      score: 92,
      classification: "GREAT",
      condition: "EXCELLENT",
    };

    // Fused live observation reports 30 kt
    const renormalized = renormalizeHourWithObservation(
      xerokampos,
      baseHour,
      30,
      36,
      225,
      "WESTERLY",
      "Europe/Athens"
    );

    // The real 30 kt observation must be preserved and not truncated to 27 kt
    expect(renormalized.localWind).toBe(30);
    expect(renormalized.localGust).toBe(36);
  });

  it("Case 16 & 17: Minimum planing wind (12 kt) threshold enforcement", () => {
    const pointLight = {
      timestamp: "2026-07-15T04:00:00.000Z",
      windSpeed: 8,
      windGust: 10,
      windDirection: 225,
      cloudCover: 0,
    };

    const resLight = normalizeHourlyPoint(
      xerokampos,
      pointLight,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    // Local wind = 8 * 1.1 = 8.8 kt < 12 kt
    expect(resLight.localWind).toBeLessThan(12);
    expect(resLight.eligibility).toBe("UNSUITABLE");
    expect(resLight.eligibilityReason).toBe("TOO_LIGHT");

    const pointPlaning = {
      timestamp: "2026-07-15T04:00:00.000Z",
      windSpeed: 12,
      windGust: 15,
      windDirection: 225,
      cloudCover: 0,
    };

    const resPlaning = normalizeHourlyPoint(
      xerokampos,
      pointPlaning,
      new Date("2026-07-15T00:00:00.000Z"),
      "WESTERLY",
      "Europe/Athens"
    );

    // Local wind = 12 * 1.1 = 13.2 kt >= 12 kt
    expect(resPlaning.localWind).toBeGreaterThanOrEqual(12);
    expect(resPlaning.eligibility).not.toBe("UNSUITABLE");
  });

  it("Case 18: Explanation generation with reasonCodesAll and reasonCodesAny", () => {
    const summaries = {
      xerokampos: {
        date: "2026-07-15",
        minWind: 14,
        maxWind: 24,
        daytimeMinWind: 18,
        daytimeMaxWind: 24,
        maxGust: 28,
        dominantDirection: "SW" as const,
        dominantDirectionDegrees: 225,
        score: 90,
        condition: "Epic" as const,
        dominantEligibility: "IDEAL" as const,
        dominantStyle: "BUMP_AND_JUMP" as const,
        reasonCodes: ["THERMAL_ACTIVE", "THERMAL_OBSERVATION_SUPPORT"] as any[],
      },
    };

    const explanations = generateRecommendationExplanation(
      EasternCreteRegion,
      "xerokampos",
      "WESTERLY",
      summaries as any
    );

    expect(explanations.some((e) => e.includes("Local weather station observations confirm active W/SW thermal breeze"))).toBe(true);
  });
});

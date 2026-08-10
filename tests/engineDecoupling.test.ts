import { describe, it, expect } from "vitest";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { evaluateQualityCurve } from "@/engine/scoring/CurveEvaluator";
import { evaluateDirectionScore, evaluateForecastConfidence } from "@/engine/scoring/DirectionEvaluator";
import { getLocalTimeComponents } from "@/lib/localWind";
import { EasternCreteRegion } from "@/regions/eastern-crete";
import { REGIONS, getRegion, isValidRegionId } from "@/regions/registry";
import { getRegionalDateKey, calculateDailySummariesGeneric } from "@/engine/forecast/ForecastNormalizer";
import { SpotForecast, SpotResult, WindSpot, HourlyWind } from "@/types/weather";

describe("Engine / Region Decoupling Refactor", () => {
  describe("Region Registry", () => {
    it("registers Eastern Crete in central registry", () => {
      expect(REGIONS.length).toBeGreaterThanOrEqual(1);
      expect(REGIONS[0].id).toBe("eastern-crete");
      expect(isValidRegionId("eastern-crete")).toBe(true);
      expect(isValidRegionId("non-existent-region")).toBe(false);

      const crete = getRegion("eastern-crete");
      expect(crete.metadata.displayName).toBe("Eastern Crete");
      expect(crete.spots.length).toBe(3);
    });

    it("falls back to DEFAULT_REGION when null or invalid ID passed", () => {
      const fallback = getRegion("unknown_id");
      expect(fallback.id).toBe("eastern-crete");
    });
  });

  describe("Timezone Generalization", () => {
    it("correctly extracts local components for any IANA timezone", () => {
      const utcTimestamp = "2026-08-10T12:00:00.000Z";
      
      const athens = getLocalTimeComponents(utcTimestamp, "Europe/Athens");
      expect(athens.hour).toBe(15); // UTC+3

      const rome = getLocalTimeComponents(utcTimestamp, "Europe/Rome");
      expect(rome.hour).toBe(14); // UTC+2

      const newYork = getLocalTimeComponents(utcTimestamp, "America/New_York");
      expect(newYork.hour).toBe(8); // UTC-4
    });

    it("extracts regional date key matching local calendar day across timezone boundaries", () => {
      // 22:30 UTC on Aug 10 -> 01:30 AM on Aug 11 in Athens (UTC+3)
      const lateUtc = "2026-08-10T22:30:00.000Z";
      expect(getRegionalDateKey(lateUtc, "Europe/Athens")).toBe("2026-08-11");
      expect(getRegionalDateKey(lateUtc, "UTC")).toBe("2026-08-10");
    });
  });

  describe("Pure Direction & Confidence Evaluator", () => {
    it("evaluates direction score purely from spotConfig without hardcoded spot switches", () => {
      const mockSpotConfig = {
        id: "custom-spot",
        name: "Custom Spot",
        latitude: 42.0,
        longitude: 11.0,
        description: "",
        sweetSpotSummary: "",
        idealDirections: ["NW" as const, "WNW" as const],
        minPlaningWind: 11,
        idealWindMin: 18,
        idealWindMax: 26,
        comfortCeilingWind: 30,
        defaultStyle: "FLAT" as const,
        qualityCurve: [],
        localCorrection: {
          baseCorrectionFactor: 1.0,
          minFactor: 0.9,
          maxFactor: 1.2,
        },
        directionScores: {
          NW: 100,
          WNW: 90,
          default: 35,
        },
      };

      expect(evaluateDirectionScore(mockSpotConfig, "NW")).toBe(100);
      expect(evaluateDirectionScore(mockSpotConfig, "WNW")).toBe(90);
      expect(evaluateDirectionScore(mockSpotConfig, "S")).toBe(35);
    });

    it("evaluates confidence score without spotId dependencies", () => {
      const confHigh = evaluateForecastConfidence(12, 100, 20);
      expect(confHigh.level).toBe("HIGH");
      expect(confHigh.confidence).toBeGreaterThanOrEqual(80);

      const confLow = evaluateForecastConfidence(80, 40, 8);
      expect(confLow.level).toBe("LOW");
      expect(confLow.confidence).toBeLessThan(60);
    });
  });

  describe("Daily Aggregation & Top-3 Session Scoring", () => {
    it("calculates daily score from the top 3 eligible hourly session scores excluding UNSUITABLE hours", () => {
      const mockSpot = EasternCreteRegion.spots[0]; // Kouremenos
      const mockHourly: HourlyWind[] = [
        // Morning calm: 09:00 - 11:00 (scores: 30, 40, 50 - eligible but weak)
        {
          timestamp: "2026-08-10T06:00:00.000Z", // 09:00 Athens
          modelWind: 10,
          modelGust: 12,
          directionDegrees: 315,
          directionLabel: "NW",
          arrowRotation: 135,
          localWind: 10,
          localGust: 12,
          correctionFactor: 1.0,
          confidence: 80,
          confidenceLevel: "HIGH",
          eligibility: "SUITABLE",
          waterState: "FLAT",
          spotWindQuality: 30,
          directionQuality: 100,
          preferenceScore: 30,
          sessionQualityScore: 30,
          score: 30,
          classification: "LIGHT",
          condition: "POOR",
        },
        {
          timestamp: "2026-08-10T07:00:00.000Z", // 10:00 Athens
          modelWind: 12,
          modelGust: 14,
          directionDegrees: 315,
          directionLabel: "NW",
          arrowRotation: 135,
          localWind: 12,
          localGust: 14,
          correctionFactor: 1.0,
          confidence: 80,
          confidenceLevel: "HIGH",
          eligibility: "SUITABLE",
          waterState: "FLAT",
          spotWindQuality: 40,
          directionQuality: 100,
          preferenceScore: 40,
          sessionQualityScore: 40,
          score: 40,
          classification: "LIGHT",
          condition: "POOR",
        },
        // Epic 3-hour afternoon session: 13:00, 14:00, 15:00 (scores: 90, 95, 85)
        {
          timestamp: "2026-08-10T10:00:00.000Z", // 13:00 Athens
          modelWind: 22,
          modelGust: 26,
          directionDegrees: 315,
          directionLabel: "NW",
          arrowRotation: 135,
          localWind: 22,
          localGust: 26,
          correctionFactor: 1.0,
          confidence: 85,
          confidenceLevel: "HIGH",
          eligibility: "IDEAL",
          waterState: "FLAT",
          spotWindQuality: 90,
          directionQuality: 100,
          preferenceScore: 90,
          sessionQualityScore: 90,
          score: 90,
          classification: "MODERATE",
          condition: "EXCELLENT",
        },
        {
          timestamp: "2026-08-10T11:00:00.000Z", // 14:00 Athens
          modelWind: 24,
          modelGust: 28,
          directionDegrees: 315,
          directionLabel: "NW",
          arrowRotation: 135,
          localWind: 24,
          localGust: 28,
          correctionFactor: 1.0,
          confidence: 85,
          confidenceLevel: "HIGH",
          eligibility: "IDEAL",
          waterState: "FLAT",
          spotWindQuality: 95,
          directionQuality: 100,
          preferenceScore: 95,
          sessionQualityScore: 95,
          score: 95,
          classification: "STRONG",
          condition: "EXCELLENT",
        },
        {
          timestamp: "2026-08-10T12:00:00.000Z", // 15:00 Athens
          modelWind: 21,
          modelGust: 25,
          directionDegrees: 315,
          directionLabel: "NW",
          arrowRotation: 135,
          localWind: 21,
          localGust: 25,
          correctionFactor: 1.0,
          confidence: 85,
          confidenceLevel: "HIGH",
          eligibility: "IDEAL",
          waterState: "FLAT",
          spotWindQuality: 85,
          directionQuality: 100,
          preferenceScore: 85,
          sessionQualityScore: 85,
          score: 85,
          classification: "MODERATE",
          condition: "VERY GOOD",
        },
        // Unsuitable gusty hour: 16:00 (score 100 on raw wind, but UNSUITABLE hard gate -> sessionQualityScore 0)
        {
          timestamp: "2026-08-10T13:00:00.000Z", // 16:00 Athens
          modelWind: 35,
          modelGust: 50,
          directionDegrees: 180,
          directionLabel: "S",
          arrowRotation: 0,
          localWind: 35,
          localGust: 50,
          correctionFactor: 1.0,
          confidence: 70,
          confidenceLevel: "MEDIUM",
          eligibility: "UNSUITABLE",
          waterState: "CHOP",
          spotWindQuality: 0,
          directionQuality: 0,
          preferenceScore: 0,
          sessionQualityScore: 0,
          score: 0,
          classification: "GALE",
          condition: "POOR",
        },
      ];

      const summaries = calculateDailySummariesGeneric(mockHourly, mockSpot, "Europe/Athens");
      expect(summaries.length).toBe(1);

      // Expected dailyScore: top 3 eligible scores = [95, 90, 85] -> average = 90
      // Weak morning hours (30, 40) and UNSUITABLE hour (0) do NOT dilute the top session score
      expect(summaries[0].score).toBe(90);
      expect(summaries[0].condition).toBe("EXCELLENT");
      expect(summaries[0].date).toBe("2026-08-10");
    });
  });

  describe("Pure Curve Evaluator", () => {
    it("evaluates custom piecewise curve without spot switches", () => {
      const customCurve = [
        { wind: 0, score: 0 },
        { wind: 15, score: 50 },
        { wind: 20, score: 100 },
        { wind: 30, score: 60 },
      ];

      expect(evaluateQualityCurve(customCurve, 0)).toBe(0);
      expect(evaluateQualityCurve(customCurve, 7.5)).toBe(25);
      expect(evaluateQualityCurve(customCurve, 20)).toBe(100);
      expect(evaluateQualityCurve(customCurve, 25)).toBe(80);
      expect(evaluateQualityCurve(customCurve, 35)).toBe(50);
    });
  });

  describe("Pure Recommendation Engine with Synthetic Mock Region", () => {
    const MockSyntheticRegion: RegionConfig = {
      id: "mock-region",
      metadata: {
        displayName: "Mock Region",
        editionTitle: "Mock Edition",
        subtitle: "Testing grounds",
        country: "Nowhere",
        defaultZoom: 10,
        defaultCenter: { latitude: 40.0, longitude: 10.0 },
      },
      timezone: "Europe/Rome",
      defaultSpotId: "spot-alpha",
      spots: [
        {
          id: "spot-alpha",
          name: "Alpha Bay",
          latitude: 40.1,
          longitude: 10.1,
          description: "Flat water speed spot",
          sweetSpotSummary: "Ideal in 20-25 kt",
          idealDirections: ["W", "NW"],
          minPlaningWind: 12,
          idealWindMin: 20,
          idealWindMax: 26,
          comfortCeilingWind: 30,
          defaultStyle: "FLAT",
          qualityCurve: [
            { wind: 0, score: 0 },
            { wind: 15, score: 60 },
            { wind: 22, score: 100 },
            { wind: 30, score: 40 },
          ],
          localCorrection: {
            baseCorrectionFactor: 1.2,
            minFactor: 1.0,
            maxFactor: 1.5,
          },
        },
        {
          id: "spot-beta",
          name: "Beta Reef",
          latitude: 40.2,
          longitude: 10.2,
          description: "Wave paradise",
          sweetSpotSummary: "Ideal in 25-35 kt",
          idealDirections: ["NW", "N"],
          minPlaningWind: 15,
          idealWindMin: 25,
          idealWindMax: 35,
          comfortCeilingWind: 40,
          defaultStyle: "WAVE",
          qualityCurve: [
            { wind: 0, score: 0 },
            { wind: 15, score: 30 },
            { wind: 28, score: 100 },
            { wind: 40, score: 70 },
          ],
          localCorrection: {
            baseCorrectionFactor: 1.0,
            minFactor: 0.9,
            maxFactor: 1.3,
          },
        },
      ],
      regimes: [
        {
          id: "STRONG_MAESTRALE",
          label: "Strong Maestrale",
          description: "NW flow > 20 kt",
          criteria: {
            directions: ["NW"],
            minRawWind: 20,
          },
        },
      ],
      explanationRules: [
        {
          id: "beta-wave-winner",
          condition: { spotId: "spot-beta" },
          explanation: "Beta Reef provides epic wave conditions today.",
        },
        {
          id: "alpha-flat-winner",
          condition: { spotId: "spot-alpha" },
          explanation: "Alpha Bay delivers butter-flat speed runs today.",
        },
      ],
    };

    it("runs recommendation engine on synthetic region with ZERO Crete dependencies and outputs generic spotScores", () => {
      function createMockForecast(
        spotId: "spot-alpha" | "spot-beta",
        score: number,
        wind: number
      ): SpotForecast {
        const spot = MockSyntheticRegion.spots.find((s) => s.id === spotId)!;
        const windSpot: WindSpot = {
          id: spot.id,
          name: spot.name,
          subtitle: spot.description,
          latitude: spot.latitude,
          longitude: spot.longitude,
          localCorrectionEnabled: true,
        };

        return {
          spot: windSpot,
          current: {
            timestamp: "2026-08-10T12:00:00.000Z",
            modelWind: wind,
            modelGust: wind * 1.2,
            directionDegrees: 315,
            directionLabel: "NW",
            arrowRotation: 135,
            localWind: wind,
            localGust: wind * 1.2,
            correctionFactor: 1.0,
            confidence: 85,
            confidenceLevel: "HIGH",
            eligibility: "IDEAL",
            waterState: spot.defaultStyle,
            spotWindQuality: score,
            directionQuality: 100,
            preferenceScore: 90,
            sessionQualityScore: score,
            score,
            classification: "GREAT",
            condition: "VERY GOOD",
          },
          hourly: [],
          days: [
            {
              date: "2026-08-10",
              minWind: wind - 2,
              maxWind: wind + 2,
              daytimeMinWind: wind - 1,
              daytimeMaxWind: wind + 1,
              maxGust: wind * 1.3,
              dominantDirection: "NW",
              dominantDirectionDegrees: 315,
              score,
              condition: "VERY GOOD",
              dominantEligibility: "UNSUITABLE", // Notice: Daily dominant is UNSUITABLE
              dominantStyle: spot.defaultStyle,
              bestWindow: {
                start: "13:00",
                end: "17:00",
                durationHours: 4.0,
                minWind: wind - 1,
                maxWind: wind + 1,
                dominantDirection: "NW",
                dominantDirectionDegrees: 315,
                score,
              },
            },
          ],
          providerModel: "TestModel",
        };
      }

      const alphaFc = createMockForecast("spot-alpha", 75, 22);
      const betaFc = createMockForecast("spot-beta", 95, 28);

      const spotsResults: Record<string, SpotResult> = {
        "spot-alpha": { status: "ok", data: alphaFc },
        "spot-beta": { status: "ok", data: betaFc },
      };

      const recommendation = RecommendationEngine.run(
        MockSyntheticRegion,
        spotsResults,
        new Date("2026-08-10T12:00:00.000Z")
      );

      expect(recommendation).not.toBeNull();
      expect(recommendation.bestSpot).toBe("spot-beta");
      expect(recommendation.bestSpotName).toBe("Beta Reef");
      expect(recommendation.score).toBe(95);
      expect(recommendation.spotScores["spot-alpha"]).toBe(75);
      expect(recommendation.spotScores["spot-beta"]).toBe(95);
      expect(recommendation.regimeLabel).toBe("Strong Maestrale");
      expect(recommendation.explanation[0]).toBe("Beta Reef provides epic wave conditions today.");
    });
  });

  describe("Eastern Crete Production Parity", () => {
    it("verifies EasternCreteRegion config consistency", () => {
      expect(EasternCreteRegion.spots.map((s) => s.id)).toEqual([
        "kouremenos",
        "tenda",
        "xerokampos",
      ]);
      expect(EasternCreteRegion.regimes.map((r) => r.id)).toContain("MELTEMI_STRONG");
      expect(EasternCreteRegion.regimes.map((r) => r.id)).toContain("MELTEMI_LIGHT");
    });
  });
});

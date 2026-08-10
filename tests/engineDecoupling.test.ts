import { describe, it, expect } from "vitest";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { evaluateQualityCurve } from "@/engine/scoring/CurveEvaluator";
import { evaluatePreferenceScore } from "@/engine/scoring/PreferenceEvaluator";
import { normalizeHourlyPoint } from "@/engine/forecast/ForecastNormalizer";
import { EasternCreteRegion } from "@/regions/eastern-crete";
import { REGIONS, getRegion, isValidRegionId } from "@/regions/registry";
import { RegionConfig } from "@/types/region";
import { SpotForecast, SpotResult } from "@/types/weather";

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

    it("runs recommendation engine on synthetic region with ZERO Crete dependencies", () => {
      function createMockForecast(
        spotId: "spot-alpha" | "spot-beta",
        score: number,
        wind: number
      ): SpotForecast {
        const spot = MockSyntheticRegion.spots.find((s) => s.id === spotId)!;
        return {
          spot: spot as any,
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
              dominantEligibility: "IDEAL",
              dominantStyle: spot.defaultStyle,
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

      const recommendation = RecommendationEngine.run(MockSyntheticRegion, spotsResults);

      expect(recommendation).not.toBeNull();
      expect(recommendation.bestSpot).toBe("spot-beta");
      expect(recommendation.bestSpotName).toBe("Beta Reef");
      expect(recommendation.score).toBe(95);
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

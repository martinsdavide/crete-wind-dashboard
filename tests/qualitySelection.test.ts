import { describe, it, expect } from "vitest";
import { calculateSpotEligibility } from "@/lib/spotEligibility";
import {
  calculateSpotWindQuality,
  calculatePreferenceScore,
  explainRecommendation,
} from "@/lib/sessionQuality";
import { estimateWaterState } from "@/lib/waterState";
import { calculateRegionalReferenceFlow, detectWindRegime } from "@/lib/windRegime";
import { findBestWindow } from "@/lib/bestWindow";
import { calculateBestSpotRecommendation, calculateDailySummaries } from "@/lib/dailySummary";
import { HourlyWind, SpotForecast } from "@/types/weather";
import { SPOTS } from "@/config/spots";

function createMockForecast(
  spotId: "kouremenos" | "tenda" | "xerokampos",
  hourlyWind: number,
  directionDegrees: number,
  directionLabel: any,
  sessionScore: number,
  dateStr = "2026-08-09"
): SpotForecast {
  const hourly: HourlyWind[] = [];
  const baseDate = new Date(`${dateStr}T06:00:00.000Z`); // 09:00 Athens

  for (let h = 0; h < 12; h++) {
    const dt = new Date(baseDate.getTime() + h * 3600000);
    const { regime } = detectWindRegime(hourlyWind, directionDegrees);
    const { eligibility, reason: eligibilityReason } = calculateSpotEligibility(
      spotId,
      directionDegrees,
      directionLabel,
      hourlyWind,
      regime
    );
    const waterState = estimateWaterState(spotId, directionLabel, hourlyWind);

    hourly.push({
      timestamp: dt.toISOString(),
      modelWind: hourlyWind * 0.85,
      modelGust: hourlyWind * 1.25,
      directionDegrees,
      directionLabel,
      arrowRotation: (directionDegrees + 180) % 360,
      localWind: hourlyWind,
      localGust: hourlyWind * 1.25,
      correctionFactor: 1.2,
      confidence: 85,
      confidenceLevel: "HIGH",
      eligibility,
      eligibilityReason,
      waterState,
      spotWindQuality: sessionScore,
      directionQuality: 90,
      preferenceScore: 85,
      sessionQualityScore: eligibility === "UNSUITABLE" ? 0 : sessionScore,
      score: eligibility === "UNSUITABLE" ? 0 : sessionScore,
      classification: "GREAT",
      condition: sessionScore >= 75 ? "VERY GOOD" : "POOR",
    });
  }

  const days = calculateDailySummaries(hourly);

  return {
    spot: SPOTS[spotId],
    current: hourly[0],
    hourly,
    days,
    providerModel: "ECMWF IFS HRES (via Open-Meteo)",
  };
}

describe("Spot Quality Selection Engine (v2)", () => {
  describe("Kouremenos Non-Monotonic Quality Curve", () => {
    it("penalizes excessive wind > 25 kt (22 kt > 28 kt > 30 kt)", () => {
      const q22 = calculateSpotWindQuality("kouremenos", 22);
      const q25 = calculateSpotWindQuality("kouremenos", 25);
      const q28 = calculateSpotWindQuality("kouremenos", 28);
      const q30 = calculateSpotWindQuality("kouremenos", 30);

      expect(q22).toBe(100);
      expect(q25).toBeGreaterThan(70);
      expect(q28).toBe(35);
      expect(q30).toBe(15);

      expect(q22).toBeGreaterThan(q28);
      expect(q28).toBeGreaterThan(q30);
    });
  });

  describe("Tenda Wave Preference & High-Wind Behaviour", () => {
    it("rewards wave conditions under strong Meltemi", () => {
      const waterState = estimateWaterState("tenda", "NW", 27);
      expect(waterState).toBe("WAVE");

      const prefScore = calculatePreferenceScore("tenda", waterState, 27, "NW");
      expect(prefScore).toBeGreaterThan(80);
    });
  });

  describe("Xerokampos Eligibility & Meltemi Exclusion", () => {
    it("marks Xerokampos as UNSUITABLE under northerly Meltemi", () => {
      const { eligibility, reason } = calculateSpotEligibility(
        "xerokampos",
        0, // N
        "N",
        28,
        "MELTEMI_STRONG"
      );
      expect(eligibility).toBe("UNSUITABLE");
      expect(reason).toBe("OFFSHORE_MELTEMI");
    });

    it("marks Xerokampos as IDEAL under WSW flow", () => {
      const { eligibility, reason } = calculateSpotEligibility(
        "xerokampos",
        247.5, // WSW
        "WSW",
        20,
        "WESTERLY"
      );
      expect(eligibility).toBe("IDEAL");
      expect(reason).toBe("IDEAL_CONDITIONS");
    });
  });

  describe("Required Logic Fixes (Section 17 - 21)", () => {
    it("Section 17: Partial-Day Xerokampos Window remains candidate and can win", () => {
      // Create Xerokampos with morning UNSUITABLE, afternoon IDEAL
      const hourly: HourlyWind[] = [];
      const baseDate = new Date("2026-08-09T06:00:00.000Z"); // 09:00 Athens

      // 09:00 - 13:00 (5 hours) UNSUITABLE (offshore Meltemi 30kt N)
      for (let h = 0; h < 5; h++) {
        const dt = new Date(baseDate.getTime() + h * 3600000);
        hourly.push({
          timestamp: dt.toISOString(),
          modelWind: 25,
          modelGust: 32,
          directionDegrees: 0,
          directionLabel: "N",
          arrowRotation: 180,
          localWind: 28,
          localGust: 34,
          correctionFactor: 1.0,
          confidence: 85,
          confidenceLevel: "HIGH",
          eligibility: "UNSUITABLE",
          eligibilityReason: "OFFSHORE_MELTEMI",
          waterState: "FLAT",
          spotWindQuality: 0,
          directionQuality: 30,
          preferenceScore: 60,
          sessionQualityScore: 0,
          score: 0,
          classification: "GREAT",
          condition: "POOR",
        });
      }

      // 14:00 - 18:00 (5 hours) IDEAL/SUITABLE (WSW shift, scores 78, 92, 96, 94, 82)
      const afternoonScores = [78, 92, 96, 94, 82];
      for (let h = 5; h < 10; h++) {
        const dt = new Date(baseDate.getTime() + h * 3600000);
        const score = afternoonScores[h - 5];
        hourly.push({
          timestamp: dt.toISOString(),
          modelWind: 18,
          modelGust: 23,
          directionDegrees: 247,
          directionLabel: "WSW",
          arrowRotation: 67,
          localWind: 21,
          localGust: 25,
          correctionFactor: 1.15,
          confidence: 90,
          confidenceLevel: "HIGH",
          eligibility: "IDEAL",
          eligibilityReason: "IDEAL_CONDITIONS",
          waterState: "CHOP",
          spotWindQuality: 95,
          directionQuality: 100,
          preferenceScore: 85,
          sessionQualityScore: score,
          score,
          classification: "GREAT",
          condition: "EXCELLENT",
        });
      }

      // 19:00 - 20:00 (2 hours) MARGINAL
      for (let h = 10; h < 12; h++) {
        const dt = new Date(baseDate.getTime() + h * 3600000);
        hourly.push({
          timestamp: dt.toISOString(),
          modelWind: 8,
          modelGust: 10,
          directionDegrees: 247,
          directionLabel: "WSW",
          arrowRotation: 67,
          localWind: 9,
          localGust: 11,
          correctionFactor: 1.0,
          confidence: 80,
          confidenceLevel: "MEDIUM",
          eligibility: "MARGINAL",
          eligibilityReason: "TOO_LIGHT",
          waterState: "FLAT",
          spotWindQuality: 10,
          directionQuality: 90,
          preferenceScore: 60,
          sessionQualityScore: 20,
          score: 20,
          classification: "LOW",
          condition: "POOR",
        });
      }

      const days = calculateDailySummaries(hourly);
      const xForecast: SpotForecast = {
        spot: SPOTS.xerokampos,
        current: hourly[0],
        hourly,
        days,
        providerModel: "ECMWF IFS HRES",
      };

      // Even though dominantEligibility was UNSUITABLE (5 hours vs 5 hours), bestWindow is NOT null!
      expect(days[0].bestWindow).not.toBeNull();
      expect(days[0].bestWindow?.start).toBe("14:00");
      expect(days[0].bestWindow?.end).toBe("19:00");
      expect(days[0].score).toBeGreaterThanOrEqual(90);

      // In competition with calm/low spots, Xerokampos MUST win!
      const kForecast = createMockForecast("kouremenos", 10, 315, "NW", 20);
      const tForecast = createMockForecast("tenda", 10, 315, "NW", 20);

      const rec = calculateBestSpotRecommendation(
        kForecast,
        tForecast,
        xForecast,
        new Date("2026-08-09T10:00:00Z")
      );

      expect(rec.bestSpot).toBe("xerokampos");
      expect(rec.bestWindow?.start).toBe("14:00");
      expect(rec.score).toBeGreaterThanOrEqual(90);
    });

    it("Section 18: No Suitable Spot returns bestSpot: null and score: 0", () => {
      const kForecast = createMockForecast("kouremenos", 40, 180, "S", 0);
      const tForecast = createMockForecast("tenda", 40, 180, "S", 0);
      const xForecast = createMockForecast("xerokampos", 40, 0, "N", 0);

      const rec = calculateBestSpotRecommendation(
        kForecast,
        tForecast,
        xForecast,
        new Date("2026-08-09T10:00:00Z")
      );

      expect(rec.bestSpot).toBeNull();
      expect(rec.bestSpotName).toBeNull();
      expect(rec.bestWindow).toBeNull();
      expect(rec.score).toBe(0);
      expect(rec.explanation[0]).toContain("No spot");
    });

    it("Section 19: Calm Day returns bestSpot: null and explains insufficient wind", () => {
      const kForecast = createMockForecast("kouremenos", 5, 315, "NW", 10);
      const tForecast = createMockForecast("tenda", 4, 315, "NW", 10);
      const xForecast = createMockForecast("xerokampos", 6, 240, "WSW", 10);

      const rec = calculateBestSpotRecommendation(
        kForecast,
        tForecast,
        xForecast,
        new Date("2026-08-09T10:00:00Z")
      );

      expect(rec.bestSpot).toBeNull();
      expect(rec.bestSpotName).toBeNull();
      expect(rec.score).toBe(0);
      expect(rec.explanation[0]).toContain("insufficient wind");
    });

    it("Section 20: Regional Regime Consistency is derived from Kouremenos + Tenda raw flow", () => {
      // Kouremenos 20 kt / 320°, Tenda 24 kt / 330°, Xerokampos 15 kt / 010°
      const result = calculateRegionalReferenceFlow(20, 320, 24, 330);
      expect(result.regionalWind).toBe(22);
      expect(result.regime).toBe("MELTEMI_MODERATE");
    });

    it("Section 21: Date / Explanation Consistency explicitly uses referenceDate", () => {
      // Forecast has Day 1 (2026-08-09) and Day 2 (2026-08-10)
      const kForecastDay1 = createMockForecast("kouremenos", 10, 315, "NW", 20, "2026-08-09");
      const kForecastDay2 = createMockForecast("kouremenos", 22, 315, "NW", 95, "2026-08-10");

      const kCombined: SpotForecast = {
        ...kForecastDay1,
        hourly: [...kForecastDay1.hourly, ...kForecastDay2.hourly],
        days: [...kForecastDay1.days, ...kForecastDay2.days],
      };

      const tForecastDay1 = createMockForecast("tenda", 10, 315, "NW", 20, "2026-08-09");
      const tForecastDay2 = createMockForecast("tenda", 15, 315, "NW", 50, "2026-08-10");
      const tCombined: SpotForecast = {
        ...tForecastDay1,
        hourly: [...tForecastDay1.hourly, ...tForecastDay2.hourly],
        days: [...tForecastDay1.days, ...tForecastDay2.days],
      };

      // Reference date explicitly set to Day 2 (2026-08-10)
      const rec = calculateBestSpotRecommendation(
        kCombined,
        tCombined,
        null,
        new Date("2026-08-10T10:00:00Z")
      );

      expect(rec.bestSpot).toBe("kouremenos");
      expect(rec.score).toBeGreaterThan(80);
      expect(rec.explanation.some((e) => e.includes("Kouremenos"))).toBe(true);
    });
  });
});

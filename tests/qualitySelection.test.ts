import { describe, it, expect } from "vitest";
import { calculateSpotEligibility } from "@/lib/spotEligibility";
import {
  calculateSpotWindQuality,
  calculatePreferenceScore,
  calculateSessionQualityScore,
  explainRecommendation,
} from "@/lib/sessionQuality";
import { estimateWaterState } from "@/lib/waterState";
import { detectWindRegime } from "@/lib/windRegime";
import { findBestWindow } from "@/lib/bestWindow";
import { calculateBestSpotRecommendation } from "@/lib/dailySummary";
import { HourlyWind, SpotForecast } from "@/types/weather";
import { SPOTS } from "@/config/spots";

function createMockForecast(
  spotId: "kouremenos" | "tenda" | "xerokampos",
  hourlyWind: number,
  directionDegrees: number,
  directionLabel: any,
  sessionScore: number
): SpotForecast {
  const hourly: HourlyWind[] = [];
  const baseDate = new Date("2026-08-09T06:00:00.000Z"); // 09:00 Athens

  for (let h = 0; h < 12; h++) {
    const dt = new Date(baseDate.getTime() + h * 3600000);
    const { regime } = detectWindRegime(hourlyWind, directionDegrees);
    const eligibility = calculateSpotEligibility(
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

  return {
    spot: SPOTS[spotId],
    current: hourly[0],
    hourly,
    days: [
      {
        date: "2026-08-09",
        minWind: hourlyWind,
        maxWind: hourlyWind,
        daytimeMinWind: hourlyWind,
        daytimeMaxWind: hourlyWind,
        maxGust: Math.round(hourlyWind * 1.25),
        dominantDirection: directionLabel,
        dominantDirectionDegrees: directionDegrees,
        score: hourly[0].sessionQualityScore,
        condition: hourly[0].condition,
        dominantEligibility: hourly[0].eligibility,
        dominantStyle: hourly[0].waterState,
        bestWindow: findBestWindow(hourly, 70, 2),
      },
    ],
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
      expect(prefScore).toBeGreaterThan(80); // base + wave bonus
    });
  });

  describe("Xerokampos Eligibility & Meltemi Exclusion", () => {
    it("marks Xerokampos as UNSUITABLE under northerly Meltemi", () => {
      const eligibility = calculateSpotEligibility(
        "xerokampos",
        0, // N
        "N",
        28,
        "MELTEMI_STRONG"
      );
      expect(eligibility).toBe("UNSUITABLE");
    });

    it("marks Xerokampos as IDEAL under WSW flow", () => {
      const eligibility = calculateSpotEligibility(
        "xerokampos",
        247.5, // WSW
        "WSW",
        20,
        "WESTERLY"
      );
      expect(eligibility).toBe("IDEAL");
    });
  });

  describe("Decision Scenarios (Specification Cases)", () => {
    it("Case A (Strong Meltemi): Tenda wins over overpowered Kouremenos", () => {
      // Kouremenos 30 kt NW (quality ~15), Tenda 27 kt NW (quality ~95)
      const kForecast = createMockForecast("kouremenos", 30, 315, "NW", 25);
      const tForecast = createMockForecast("tenda", 27, 315, "NW", 92);
      const xForecast = createMockForecast("xerokampos", 30, 0, "N", 0);

      const rec = calculateBestSpotRecommendation(
        kForecast,
        tForecast,
        xForecast,
        new Date("2026-08-09T10:00:00Z")
      );

      expect(rec.bestSpot).toBe("tenda");
      expect(rec.sailingStyle).toBe("WAVE");
      expect(rec.explanation.some((e) => e.includes("Tenda"))).toBe(true);
    });

    it("Case B (Moderate Meltemi): Kouremenos wins inside its sweet spot", () => {
      // Kouremenos 20 kt NW (quality ~98), Tenda 16 kt NW (quality ~65)
      const kForecast = createMockForecast("kouremenos", 20, 315, "NW", 96);
      const tForecast = createMockForecast("tenda", 16, 315, "NW", 68);
      const xForecast = createMockForecast("xerokampos", 12, 0, "N", 0);

      const rec = calculateBestSpotRecommendation(
        kForecast,
        tForecast,
        xForecast,
        new Date("2026-08-09T10:00:00Z")
      );

      expect(rec.bestSpot).toBe("kouremenos");
      expect(rec.explanation.some((e) => e.includes("Kouremenos"))).toBe(true);
    });

    it("Case C (W/SW Flow): Xerokampos wins when Meltemi is absent", () => {
      // Kouremenos 11 kt, Tenda 9 kt, Xerokampos 20 kt WSW (quality ~95)
      const kForecast = createMockForecast("kouremenos", 11, 240, "WSW", 30);
      const tForecast = createMockForecast("tenda", 9, 240, "WSW", 20);
      const xForecast = createMockForecast("xerokampos", 20, 247.5, "WSW", 94);

      const rec = calculateBestSpotRecommendation(
        kForecast,
        tForecast,
        xForecast,
        new Date("2026-08-09T10:00:00Z")
      );

      expect(rec.bestSpot).toBe("xerokampos");
      expect(rec.explanation.some((e) => e.includes("Xerokampos"))).toBe(true);
    });
  });
});

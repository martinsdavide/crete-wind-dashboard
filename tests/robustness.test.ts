import { describe, it, expect } from "vitest";
import { calculateLocalWind, calculateLocalGust } from "@/lib/localWind";
import {
  calculateOverallWindScore,
  calculateWindStrengthScore,
  calculateGustinessScore,
  calculateForecastConfidence,
} from "@/lib/windScore";
import { degreesToCompass, circularMeanDegrees, compassToArrowRotation } from "@/lib/windDirection";
import { calculateCurrentConditions, interpolateAngle } from "@/lib/weather/normalizeForecast";
import { SPOTS } from "@/config/spots";
import { HourlyWind } from "@/types/weather";

describe("Robustness & Edge Case Suite", () => {
  it("handles zero wind without producing NaN or negative values", () => {
    const local = calculateLocalWind("kouremenos", 0, 315, "2026-08-08T14:00:00+03:00", 0);
    expect(local.localWind).toBe(0);
    expect(isNaN(local.localWind)).toBe(false);

    const gust = calculateLocalGust(0, 0, 0);
    expect(gust).toBe(0);
    expect(isNaN(gust)).toBe(false);

    const strengthScore = calculateWindStrengthScore(0);
    expect(strengthScore).toBe(0);
  });

  it("handles missing or NaN gust gracefully", () => {
    const gust = calculateLocalGust(NaN, 20, 18);
    expect(gust).toBeGreaterThanOrEqual(20);
    expect(isNaN(gust)).toBe(false);
  });

  it("handles exactly 360° direction and negative degrees", () => {
    expect(degreesToCompass(360)).toBe("N");
    expect(degreesToCompass(0)).toBe("N");
    expect(degreesToCompass(-360)).toBe("N");
    expect(compassToArrowRotation(360)).toBe(180);
    expect(compassToArrowRotation(0)).toBe(180);
  });

  it("enforces correction factor clamping limits (min 0.90, max 1.45 for Kouremenos)", () => {
    // Extreme theoretical inputs
    const normalSummer = calculateLocalWind(
      "kouremenos",
      25,
      315,
      "2026-07-20T16:00:00+03:00",
      0
    );
    expect(normalSummer.correctionFactor).toBeLessThanOrEqual(1.45);
    expect(normalSummer.correctionFactor).toBeGreaterThanOrEqual(0.90);
  });

  it("enforces score boundaries [0, 100]", () => {
    expect(calculateOverallWindScore(-50, -50, -50, -50)).toBe(0);
    expect(calculateOverallWindScore(150, 150, 150, 150)).toBe(100);
  });

  it("correctly interpolates angles across the 359° -> 1° seam", () => {
    // Halfway between 350° and 10° should be 0° / 360°
    const midAngle = interpolateAngle(350, 10, 0.5);
    expect(midAngle).toBe(0);
  });

  it("interpolates current NOW conditions when current time is between hourly points", () => {
    const mockHourly: any[] = [
      {
        timestamp: "2026-08-08T14:00:00+03:00",
        modelWind: 20,
        modelGust: 26,
        directionDegrees: 310,
        directionLabel: "NW",
        arrowRotation: 130,
        localWind: 26,
        localGust: 29.6,
        correctionFactor: 1.30,
        confidence: 85,
        confidenceLevel: "HIGH",
        score: 88,
        classification: "GREAT",
        condition: "VERY GOOD",
      },
      {
        timestamp: "2026-08-08T15:00:00+03:00",
        modelWind: 24,
        modelGust: 30,
        directionDegrees: 320,
        directionLabel: "NW",
        arrowRotation: 140,
        localWind: 31.2,
        localGust: 34.3,
        correctionFactor: 1.30,
        confidence: 85,
        confidenceLevel: "HIGH",
        score: 92,
        classification: "STRONG",
        condition: "EXCELLENT",
      },
    ];

    // Current time at 14:30 (halfway)
    const currentTime = new Date("2026-08-08T14:30:00+03:00");
    const current = calculateCurrentConditions(SPOTS.kouremenos, mockHourly, currentTime);

    expect(current.modelWind).toBeCloseTo(22, 1);
    expect(current.directionDegrees).toBeCloseTo(315, 1);
    expect(current.localWind).toBeGreaterThan(22);
    expect(isNaN(current.localWind)).toBe(false);
  });
});

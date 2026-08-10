import { describe, it, expect } from "vitest";
import {
  calculateWindStatistics,
  calculateCircularDirectionStatistics,
  calculateGustiness,
  calculateStabilityScore,
  calculateConfidence,
  calculateWindowStability,
} from "@/lib/windowStability";
import { HourlyWind } from "@/types/weather";

function createMockHour(
  localWind: number,
  localGust: number,
  directionDegrees: number
): HourlyWind {
  return {
    timestamp: "2026-08-10T12:00:00.000Z",
    modelWind: localWind,
    modelGust: localGust,
    directionDegrees,
    directionLabel: "NW",
    arrowRotation: 135,
    localWind,
    localGust,
    correctionFactor: 1.0,
    confidence: 85,
    confidenceLevel: "HIGH",
    eligibility: "IDEAL",
    waterState: "BUMP_AND_JUMP",
    spotWindQuality: 85,
    directionQuality: 100,
    preferenceScore: 90,
    sessionQualityScore: 88,
    score: 88,
    classification: "GREAT",
    condition: "VERY GOOD",
  };
}

describe("Window Stability & Recommendation Confidence", () => {
  describe("Test Case A: Steady Wind", () => {
    it("classifies steady wind (26, 27, 26, 27, 26) as Very Stable with HIGH confidence", () => {
      const winds = [26, 27, 26, 27, 26];
      const stats = calculateWindStatistics(winds);

      expect(stats.minWind).toBe(26);
      expect(stats.maxWind).toBe(27);
      expect(stats.windStdDev).toBeLessThanOrEqual(1.0);
      expect(stats.windStabilityLabel).toBe("Very Stable");

      const hours = winds.map((w) => createMockHour(w, w + 2, 320));
      const stability = calculateWindowStability(hours);

      expect(stability).not.toBeNull();
      expect(stability?.windStabilityLabel).toBe("Very Stable");
      expect(stability?.confidence).toBe("HIGH");
      expect(stability?.stabilityScore).toBeGreaterThanOrEqual(85);
    });
  });

  describe("Test Case B: Variable Wind", () => {
    it("classifies fluctuating wind (18, 25, 20, 29, 21) as Variable", () => {
      const winds = [18, 25, 20, 29, 21];
      const stats = calculateWindStatistics(winds);

      expect(stats.minWind).toBe(18);
      expect(stats.maxWind).toBe(29);
      expect(stats.windStdDev).toBeGreaterThan(2.5);
      expect(["Variable", "Highly Variable"]).toContain(stats.windStabilityLabel);

      const hours = winds.map((w) => createMockHour(w, w + 6, 320));
      const stability = calculateWindowStability(hours);

      expect(stability).not.toBeNull();
      expect(["MEDIUM", "LOW"]).toContain(stability?.confidence);
    });
  });

  describe("Test Case C: Circular Direction Wrap-Around", () => {
    it("handles circular wrap-around at 360°/0° boundary (359°, 1°, 2°, 359°) with no arithmetic error", () => {
      const directions = [359, 1, 2, 359];
      const stats = calculateCircularDirectionStatistics(directions);

      // Circular mean should be ~0.25° (N), NOT 180°
      expect(stats.meanDirection).toBeLessThan(5);
      // Circular range should be ~3°, NOT 358°
      expect(stats.directionRange).toBeLessThanOrEqual(4);
      expect(stats.directionStabilityLabel).toBe("Very Stable");
      expect(stats.directionRangeLabel).toMatch(/N/);
    });

    it("correctly formats direction range labels for standard compass shifts", () => {
      // 320° to 335° -> NW to NNW
      const shift1 = calculateCircularDirectionStatistics([320, 328, 335]);
      expect(shift1.directionRangeLabel).toBe("NW → NNW");

      // 275° to 290° -> W to WNW
      const shift2 = calculateCircularDirectionStatistics([275, 282, 290]);
      expect(shift2.directionRangeLabel).toBe("W → WNW");

      // 330° to 030° -> NNW to NNE
      const shift3 = calculateCircularDirectionStatistics([330, 0, 30]);
      expect(shift3.directionRangeLabel).toBe("NNW → NNE");
    });
  });

  describe("Test Case D: Smooth Airflow", () => {
    it("classifies low gust factor (Wind 28 kt, Gust 29 kt) as Smooth", () => {
      const stats = calculateGustiness([28], [29]);
      expect(stats.gustFactor).toBeLessThanOrEqual(1.10);
      expect(stats.gustinessLabel).toBe("Smooth");
    });
  });

  describe("Test Case E: Very Gusty Airflow", () => {
    it("classifies high gust factor (Wind 25 kt, Gust 38 kt) as Very Gusty", () => {
      const stats = calculateGustiness([25], [38]);
      expect(stats.gustFactor).toBeGreaterThan(1.35);
      expect(stats.gustinessLabel).toBe("Very Gusty");
    });
  });

  describe("Stability Scoring & Weights", () => {
    it("produces composite 0-100 stability score correctly", () => {
      const scoreHigh = calculateStabilityScore(0.5, 3.0, 1.05);
      expect(scoreHigh).toBeGreaterThanOrEqual(85);
      expect(calculateConfidence(scoreHigh)).toBe("HIGH");

      const scoreLow = calculateStabilityScore(6.0, 35.0, 1.45);
      expect(scoreLow).toBeLessThan(60);
      expect(calculateConfidence(scoreLow)).toBe("LOW");
    });
  });
});

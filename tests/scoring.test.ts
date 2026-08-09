import { describe, it, expect } from "vitest";
import {
  calculateWindStrengthScore,
  calculateDirectionScore,
  calculateGustinessScore,
  calculateForecastConfidence,
  calculateOverallWindScore,
  getWindClassification,
  getConditionLabel,
} from "@/lib/windScore";

describe("Windsurfing Scoring Engine", () => {
  describe("Wind Strength Score", () => {
    it("returns correct score across generic piecewise interpolation thresholds", () => {
      expect(calculateWindStrengthScore(0)).toBe(0);
      expect(calculateWindStrengthScore(6)).toBe(10);
      expect(calculateWindStrengthScore(12)).toBe(20);
      expect(calculateWindStrengthScore(15)).toBe(50);
      expect(calculateWindStrengthScore(18)).toBe(80);
      expect(calculateWindStrengthScore(22)).toBe(100);
      expect(calculateWindStrengthScore(25)).toBe(95); // (22->100, 28->90) -> halfway is 95
      expect(calculateWindStrengthScore(28)).toBe(90);
      expect(calculateWindStrengthScore(30)).toBe(80); // (28->90, 32->70) -> halfway is 80
      expect(calculateWindStrengthScore(32)).toBe(70);
      expect(calculateWindStrengthScore(36)).toBe(40);
    });
  });

  describe("Direction Score", () => {
    it("scores Kouremenos directions correctly", () => {
      expect(calculateDirectionScore("kouremenos", "NW")).toBe(100);
      expect(calculateDirectionScore("kouremenos", "NNW")).toBe(95);
      expect(calculateDirectionScore("kouremenos", "WNW")).toBe(90);
      expect(calculateDirectionScore("kouremenos", "N")).toBe(80);
      expect(calculateDirectionScore("kouremenos", "W")).toBe(65);
      expect(calculateDirectionScore("kouremenos", "S")).toBe(40);
    });

    it("scores Tenda directions correctly", () => {
      expect(calculateDirectionScore("tenda", "NW")).toBe(100);
      expect(calculateDirectionScore("tenda", "NNW")).toBe(100);
      expect(calculateDirectionScore("tenda", "N")).toBe(90);
      expect(calculateDirectionScore("tenda", "WNW")).toBe(85);
      expect(calculateDirectionScore("tenda", "SE")).toBe(40);
    });
  });

  describe("Gustiness Score", () => {
    it("assigns appropriate score based on gust ratio", () => {
      expect(calculateGustinessScore(20, 22)).toBe(100);
      expect(calculateGustinessScore(20, 25)).toBe(90);
      expect(calculateGustinessScore(20, 28)).toBe(70);
      expect(calculateGustinessScore(20, 32)).toBe(40);
    });
  });

  describe("Forecast Confidence", () => {
    it("calculates confidence adjustments properly", () => {
      const res1 = calculateForecastConfidence(12, "kouremenos", "NW", 18);
      expect(res1.confidence).toBe(95);
      expect(res1.level).toBe("HIGH");

      const res2 = calculateForecastConfidence(80, "kouremenos", "S", 8);
      expect(res2.confidence).toBe(45);
      expect(res2.level).toBe("LOW");
    });
  });

  describe("Overall Score & Classifications", () => {
    it("combines weighted scores into 0-100 score and assigns condition label", () => {
      const score = calculateOverallWindScore(100, 100, 100, 90);
      expect(score).toBe(99);
      expect(getConditionLabel(score)).toBe("EXCELLENT");
    });

    it("classifies wind speeds into semantic ranges", () => {
      expect(getWindClassification(10)).toBe("LOW");
      expect(getWindClassification(14)).toBe("LIGHT");
      expect(getWindClassification(19)).toBe("GOOD");
      expect(getWindClassification(24)).toBe("GREAT");
      expect(getWindClassification(30)).toBe("STRONG");
      expect(getWindClassification(38)).toBe("VERY STRONG");
    });
  });
});

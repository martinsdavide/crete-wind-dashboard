import { describe, it, expect } from "vitest";
import {
  calculateLocalWind,
  calculateLocalGust,
  calculateThermalFactor,
  isWithinThermalSeason,
} from "@/lib/localWind";

describe("Local Wind Correction Engine", () => {
  // Summer afternoon in Athens (July 15 at 16:00 local Greek time -> UTC 13:00)
  const summerAfternoonAthens = "2026-07-15T16:00:00+03:00";
  // Winter afternoon (January 15 at 16:00)
  const winterAfternoonAthens = "2026-01-15T16:00:00+03:00";
  // Summer midnight (July 15 at 00:00 local Greek time)
  const summerMidnightAthens = "2026-07-15T00:00:00+03:00";

  describe("Kouremenos Correction", () => {
    it("NW + 18 kt + summer afternoon + clear sky gives localWind > modelWind", () => {
      const result = calculateLocalWind(
        "kouremenos",
        18,
        315, // NW
        summerAfternoonAthens,
        0 // 0% cloud
      );

      // NW directionBoost: 1.25 - 1 = 0.25
      // 16:00 thermalBoost: 1.15 - 1 = 0.15
      // Total factor: 1 + 0.25 + 0.15 = 1.40
      // 18 * 1.40 = 25.2 kt
      expect(result.localWind).toBeGreaterThan(18);
      expect(result.correctionFactor).toBeCloseTo(1.40, 2);
      expect(result.localWind).toBeCloseTo(25.2, 1);
    });

    it("SE + 18 kt gives little/no local correction", () => {
      const result = calculateLocalWind(
        "kouremenos",
        18,
        135, // SE
        summerAfternoonAthens,
        0
      );

      // SE has default direction factor (1.00) -> boost 0
      // Thermal boost: 0.15
      // Factor: 1.15
      expect(result.directionFactor).toBe(1.00);
    });

    it("NW + midnight has thermal correction absent (thermalFactor = 1.00)", () => {
      const result = calculateLocalWind(
        "kouremenos",
        18,
        315, // NW
        summerMidnightAthens,
        0
      );

      // Midnight: hour 0 -> thermalFactor is 1.00
      expect(result.thermalFactor).toBe(1.00);
      expect(result.correctionFactor).toBeCloseTo(1.25, 2);
      expect(result.localWind).toBeCloseTo(18 * 1.25, 1);
    });

    it("NW + summer afternoon + heavy cloud attenuates the thermal boost", () => {
      const clearResult = calculateLocalWind(
        "kouremenos",
        18,
        315,
        summerAfternoonAthens,
        10 // clear
      );

      const cloudyResult = calculateLocalWind(
        "kouremenos",
        18,
        315,
        summerAfternoonAthens,
        90 // heavy cloud
      );

      expect(cloudyResult.localWind).toBeLessThan(clearResult.localWind);
      expect(cloudyResult.cloudAttenuation).toBe(0.15);
      // direction boost (0.25) + thermal boost (0.15 * 0.15 = 0.0225) = 1.2725
      expect(cloudyResult.correctionFactor).toBeCloseTo(1.2725, 2);
    });

    it("outside thermal season (winter), thermal factor remains 1.00", () => {
      const result = calculateLocalWind(
        "kouremenos",
        18,
        315,
        winterAfternoonAthens,
        0
      );

      expect(result.thermalFactor).toBe(1.00);
      expect(result.correctionFactor).toBeCloseTo(1.25, 2);
    });
  });

  describe("Tenda Correction", () => {
    it("NW gives modest conservative correction (1.10) without thermal profile", () => {
      const result = calculateLocalWind(
        "tenda",
        20,
        315, // NW
        summerAfternoonAthens,
        0
      );

      expect(result.correctionFactor).toBeCloseTo(1.10, 2);
      expect(result.localWind).toBeCloseTo(22.0, 1);
      expect(result.thermalFactor).toBe(1.00);
    });

    it("SE gives no correction (factor 1.00)", () => {
      const result = calculateLocalWind(
        "tenda",
        20,
        135, // SE
        summerAfternoonAthens,
        0
      );

      expect(result.correctionFactor).toBe(1.00);
      expect(result.localWind).toBe(20);
    });
  });

  describe("Local Gust Calculations", () => {
    it("guarantees localGust is never below localWind", () => {
      const gust = calculateLocalGust(15, 25, 20);
      expect(gust).toBeGreaterThanOrEqual(25);
    });

    it("calculates localGust correctly using the formula", () => {
      // modelGust: 25, localWind: 24, modelWind: 18
      // delta = 24 - 18 = 6 -> adjustment = 6 * 0.60 = 3.6
      // gust = 25 + 3.6 = 28.6
      const gust = calculateLocalGust(25, 24, 18, 0.60);
      expect(gust).toBeCloseTo(28.6, 1);
    });

    it("zero wind does not cause invalid arithmetic or NaN", () => {
      const gust = calculateLocalGust(0, 0, 0);
      expect(gust).toBe(0);
      expect(isNaN(gust)).toBe(false);
    });
  });
});

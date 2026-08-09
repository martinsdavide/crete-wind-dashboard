import { describe, it, expect } from "vitest";
import {
  calculateLocalWind,
  calculateLocalGust,
  calculateThermalFactor,
  calculateCloudAttenuation,
  isWithinThermalSeason,
  getAthensTimeComponents,
} from "@/lib/localWind";

describe("Local Wind Correction Engine", () => {
  describe("Kouremenos Correction", () => {
    it("NW + 18 kt + summer afternoon + clear sky gives localWind > modelWind", () => {
      // 15 July 2026 at 14:00 Athens time (11:00 UTC)
      const timestamp = "2026-07-15T11:00:00.000Z";
      const result = calculateLocalWind("kouremenos", 18, 315, timestamp, 0);

      // NW direction factor = 1.25, thermal factor at 14:00 = 1.12
      // boost = (0.25) + (0.12 * 1.00) = 0.37 => factor = 1.37
      expect(result.directionFactor).toBe(1.25);
      expect(result.thermalFactor).toBeCloseTo(1.12, 2);
      expect(result.cloudAttenuation).toBe(1.00);
      expect(result.correctionFactor).toBeCloseTo(1.37, 2);
      expect(result.localWind).toBeCloseTo(18 * 1.37, 1);
      expect(result.localWind).toBeGreaterThan(18);
    });

    it("SE + 18 kt gives little/no local correction", () => {
      const timestamp = "2026-07-15T11:00:00.000Z";
      const result = calculateLocalWind("kouremenos", 18, 135, timestamp, 0);

      expect(result.directionFactor).toBe(1.00);
    });

    it("NW + midnight has thermal correction absent (thermalFactor = 1.00)", () => {
      // 15 July 2026 at 00:00 Athens time (21:00 UTC previous day)
      const timestamp = "2026-07-14T21:00:00.000Z";
      const result = calculateLocalWind("kouremenos", 18, 315, timestamp, 0);

      expect(result.thermalFactor).toBe(1.00);
      expect(result.correctionFactor).toBe(1.25);
      expect(result.localWind).toBe(18 * 1.25);
    });

    it("NW + summer afternoon + heavy cloud attenuates the thermal boost", () => {
      const timestamp = "2026-07-15T11:00:00.000Z";
      const result = calculateLocalWind("kouremenos", 18, 315, timestamp, 90);

      // Cloud cover 90% gives factor 0.15 for thermal boost
      expect(result.cloudAttenuation).toBe(0.15);
      // factor = 1 + 0.25 + 0.12 * 0.15 = 1.268
      expect(result.correctionFactor).toBeCloseTo(1.268, 2);
      expect(result.localWind).toBeLessThan(18 * 1.37);
    });

    it("outside thermal season (winter), thermal factor remains 1.00", () => {
      // 15 January at 14:00 Athens
      const timestamp = "2026-01-15T12:00:00.000Z";
      const result = calculateLocalWind("kouremenos", 18, 315, timestamp, 0);

      expect(result.thermalFactor).toBe(1.00);
      expect(result.correctionFactor).toBe(1.25);
    });
  });

  describe("Tenda Correction", () => {
    it("NW gives exposed cape correction (1.15) without thermal profile", () => {
      const timestamp = "2026-07-15T11:00:00.000Z";
      const result = calculateLocalWind("tenda", 20, 315, timestamp, 0);

      expect(result.correctionFactor).toBeCloseTo(1.15, 2);
      expect(result.localWind).toBeCloseTo(23.0, 1);
      expect(result.thermalFactor).toBe(1.00);
    });

    it("SE gives no correction (factor 1.00)", () => {
      const timestamp = "2026-07-15T11:00:00.000Z";
      const result = calculateLocalWind("tenda", 20, 135, timestamp, 0);

      expect(result.correctionFactor).toBe(1.00);
      expect(result.localWind).toBe(20);
    });
  });

  describe("Local Gust Calculations", () => {
    it("guarantees localGust is never below localWind", () => {
      const localGust = calculateLocalGust(10, 25, 20);
      expect(localGust).toBeGreaterThanOrEqual(25);
    });

    it("calculates localGust correctly using the formula", () => {
      // localGust = modelGust + (localWind - modelWind) * 0.60
      // 25 + (24 - 18) * 0.60 = 25 + 3.6 = 28.6
      const localGust = calculateLocalGust(25, 24, 18);
      expect(localGust).toBeCloseTo(28.6, 1);
    });

    it("zero wind does not cause invalid arithmetic or NaN", () => {
      const localGust = calculateLocalGust(0, 0, 0);
      expect(localGust).toBe(0);
      expect(isNaN(localGust)).toBe(false);
    });
  });
});

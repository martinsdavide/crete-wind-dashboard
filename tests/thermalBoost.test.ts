import { describe, it, expect } from "vitest";
import {
  calculateThermalStrength,
  calculateLocalCorrectionFactor,
  interpolateCurve,
} from "@/engine/forecast/ForecastNormalizer";
import { MaremmaRegion } from "@/regions/maremma";
import { RegionSpotConfig } from "@/types/region";

describe("Dynamic Diurnal Thermal Boost Model", () => {
  const talamoneSpot = MaremmaRegion.spots.find((s) => s.id === "talamone")!;

  describe("Generic Curve Interpolator", () => {
    const points = [
      { x: 0, y: 0.2 },
      { x: 10, y: 1.0 },
      { x: 20, y: 0.5 },
    ];

    it("clamps values outside range to boundary endpoints", () => {
      expect(interpolateCurve(-5, points)).toBe(0.2);
      expect(interpolateCurve(25, points)).toBe(0.5);
    });

    it("evaluates exact match points", () => {
      expect(interpolateCurve(0, points)).toBe(0.2);
      expect(interpolateCurve(10, points)).toBe(1.0);
      expect(interpolateCurve(20, points)).toBe(0.5);
    });

    it("linearly interpolates within intervals", () => {
      expect(interpolateCurve(5, points)).toBeCloseTo(0.6, 3);
      expect(interpolateCurve(15, points)).toBeCloseTo(0.75, 3);
    });
  });

  describe("Backward Compatibility (FIXED Model)", () => {
    const legacySpot: RegionSpotConfig = {
      ...talamoneSpot,
      localCorrection: {
        baseCorrectionFactor: 1.0,
        minFactor: 0.8,
        maxFactor: 1.5,
        diurnalThermalBoost: {
          model: "FIXED",
          startHour: 13,
          endHour: 18,
          boostAmount: 0.15,
        },
      },
    };

    it("applies fixed boost when within configured hours and 0 when outside", () => {
      // 14:00 Rome time
      const insideTime = new Date("2026-08-10T12:00:00Z"); // 14:00 Rome
      const evalInside = calculateThermalStrength(
        legacySpot,
        insideTime,
        "NW",
        12,
        0,
        "Europe/Rome"
      );
      expect(evalInside.active).toBe(true);
      expect(evalInside.boost).toBe(0.15);

      // 09:00 Rome time
      const outsideTime = new Date("2026-08-10T07:00:00Z"); // 09:00 Rome
      const evalOutside = calculateThermalStrength(
        legacySpot,
        outsideTime,
        "NW",
        12,
        0,
        "Europe/Rome"
      );
      expect(evalOutside.active).toBe(false);
      expect(evalOutside.boost).toBe(0);
    });
  });

  describe("Talamone Scenarios A–E Specification Tests", () => {
    it("Scenario A (Optimal Summer Afternoon): July, 14:00 Rome, NW, 10 kt model, 10% cloud -> strong boost", () => {
      const time = new Date("2026-07-15T12:00:00Z"); // 14:00 Rome (UTC+2)
      const res = calculateThermalStrength(
        talamoneSpot,
        time,
        "NW",
        10, // model wind (optimal)
        10, // cloud cover (clear)
        "Europe/Rome"
      );

      expect(res.active).toBe(true);
      expect(res.factors.season).toBe(1.0);
      expect(res.factors.time).toBeCloseTo(0.75, 2);
      expect(res.factors.direction).toBe(1.0);
      expect(res.factors.synopticWind).toBe(1.0);
      expect(res.factors.solar).toBe(1.0);
      expect(res.strength).toBeGreaterThanOrEqual(0.70);
      expect(res.boost).toBeGreaterThanOrEqual(0.14);
    });

    it("Scenario B (Strong Synoptic Suppression): July, 16:00 Rome, NW, 25 kt model, 10% cloud -> near-zero boost", () => {
      const time = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome
      const res = calculateThermalStrength(
        talamoneSpot,
        time,
        "NW",
        25, // strong model wind (> 24 kt)
        10,
        "Europe/Rome"
      );

      // Synoptic wind curve at 25 kt clamps to factor 0.0
      expect(res.factors.synopticWind).toBe(0.0);
      expect(res.strength).toBe(0.0);
      expect(res.boost).toBe(0.0);
      expect(res.active).toBe(false);
    });

    it("Scenario C (Overcast Suppression): July, 15:00 Rome, NW, 10 kt model, 90% cloud -> weak thermal boost", () => {
      const time = new Date("2026-07-15T13:00:00Z"); // 15:00 Rome
      const res = calculateThermalStrength(
        talamoneSpot,
        time,
        "NW",
        10,
        90, // 90% cloud cover
        "Europe/Rome"
      );

      // Cloud factor at 90% is around ~0.175
      expect(res.factors.solar).toBeLessThan(0.30);
      expect(res.strength).toBeLessThan(0.30);
      expect(res.boost).toBeLessThan(0.06);
    });

    it("Scenario D (Winter Inactivity): January, 15:00 Rome, NW, 8 kt model, clear sky -> 0 boost", () => {
      const time = new Date("2026-01-15T14:00:00Z"); // 15:00 Rome (UTC+1)
      const res = calculateThermalStrength(
        talamoneSpot,
        time,
        "NW",
        8,
        0,
        "Europe/Rome"
      );

      expect(res.factors.season).toBe(0.0);
      expect(res.strength).toBe(0.0);
      expect(res.boost).toBe(0.0);
      expect(res.active).toBe(false);
    });

    it("Scenario E (Incompatible Direction): August, 16:00 Rome, East, 8 kt model, clear sky -> minimal boost", () => {
      const time = new Date("2026-08-15T14:00:00Z"); // 16:00 Rome
      const res = calculateThermalStrength(
        talamoneSpot,
        time,
        "E",
        8,
        0,
        "Europe/Rome"
      );

      // Default direction factor is 0.10
      expect(res.factors.direction).toBe(0.10);
      expect(res.strength).toBeCloseTo(0.10, 2);
      expect(res.boost).toBeCloseTo(0.02, 2);
    });
  });

  describe("Talamone Diurnal Time Profile Ramp", () => {
    it("follows a smooth bell-shaped curve peaking around 16:00 Rome", () => {
      const dateBase = "2026-07-15"; // July

      const hours = [9, 11, 13, 14, 15, 16, 17, 18, 19, 21];
      const strengths: number[] = [];

      for (const h of hours) {
        const utcHour = h - 2; // Rome is UTC+2 in July
        const dt = new Date(`${dateBase}T${String(utcHour).padStart(2, "0")}:00:00Z`);
        const evalRes = calculateThermalStrength(
          talamoneSpot,
          dt,
          "NW",
          10,
          0,
          "Europe/Rome"
        );
        strengths.push(evalRes.strength);
      }

      // Hour 9 (outside): 0
      expect(strengths[0]).toBe(0);
      // 11:00 < 13:00 < 16:00
      expect(strengths[1]).toBeLessThan(strengths[2]);
      expect(strengths[2]).toBeLessThan(strengths[5]);
      // 16:00 is peak (1.0)
      expect(strengths[5]).toBe(1.0);
      // 16:00 > 17:00 > 18:00 > 19:00
      expect(strengths[5]).toBeGreaterThan(strengths[6]);
      expect(strengths[6]).toBeGreaterThan(strengths[7]);
      expect(strengths[7]).toBeGreaterThan(strengths[8]);
      // Hour 21 (outside): 0
      expect(strengths[9]).toBe(0);
    });
  });

  describe("Safety Clamping within maxFactor", () => {
    it("never exceeds spot maxFactor even under maximum boost", () => {
      const peakTime = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome (peak)
      const correction = calculateLocalCorrectionFactor(
        talamoneSpot,
        peakTime,
        "NW",
        315,
        12, // optimal model wind
        0,  // clear sky
        "Europe/Rome"
      );

      // base 1.05 + boost 0.20 = 1.25, well within maxFactor 1.35
      expect(correction.factor).toBe(1.25);
      expect(correction.factor).toBeLessThanOrEqual(talamoneSpot.localCorrection.maxFactor);
      expect(correction.thermal.active).toBe(true);
    });
  });

  describe("Talamone Validation Comparisons", () => {
    it("produces higher local wind in clear summer afternoon NW than morning", () => {
      const morningTime = new Date("2026-07-15T07:00:00Z"); // 09:00 Rome
      const afternoonTime = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome

      const morning = calculateLocalCorrectionFactor(
        talamoneSpot,
        morningTime,
        "NW",
        315,
        10,
        0,
        "Europe/Rome"
      );
      const afternoon = calculateLocalCorrectionFactor(
        talamoneSpot,
        afternoonTime,
        "NW",
        315,
        10,
        0,
        "Europe/Rome"
      );

      expect(afternoon.factor).toBeGreaterThan(morning.factor);
    });

    it("produces higher local wind in clear summer afternoon NW than overcast afternoon", () => {
      const afternoonTime = new Date("2026-07-15T14:00:00Z"); // 16:00 Rome

      const clear = calculateLocalCorrectionFactor(
        talamoneSpot,
        afternoonTime,
        "NW",
        315,
        10,
        0,
        "Europe/Rome"
      );
      const overcast = calculateLocalCorrectionFactor(
        talamoneSpot,
        afternoonTime,
        "NW",
        315,
        10,
        95,
        "Europe/Rome"
      );

      expect(clear.factor).toBeGreaterThan(overcast.factor);
    });
  });
});

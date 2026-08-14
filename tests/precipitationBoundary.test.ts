/**
 * precipitationBoundary.test.ts
 *
 * Verifies that Open-Meteo precipitation values are treated as preceding-hour
 * interval totals [T-1h, T) at timestamp T, and are never interpolated between
 * hourly buckets.
 *
 * At any time between hour H and hour H+1, the semantically correct precipitation
 * bucket is the one at H+1 (next), since the interval [H, H+1) that contains the
 * current moment is reported at timestamp H+1.
 */

import { describe, it, expect } from "vitest";

// We test the precipitation logic via the normalizer end-to-end, constructing
// a minimal OpenMeteoRawResponse and verifying the normalized current conditions.
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { RegionSpotConfig } from "@/types/region";

// Minimal spot config that satisfies normalizeHourlyPoint requirements
const mockSpot: RegionSpotConfig = {
  id: "test-spot",
  name: "Test Spot",
  description: "",
  sweetSpotSummary: "",
  latitude: 43.0,
  longitude: 10.8,
  idealDirections: ["NW", "W", "SW"],
  minPlaningWind: 10,
  idealWindMin: 14,
  idealWindMax: 22,
  comfortCeilingWind: 30,
  defaultStyle: "FLAT",
  qualityCurve: [],
  localCorrection: {
    baseCorrectionFactor: 1.0,
    minFactor: 0.8,
    maxFactor: 1.2,
  },
  directionScores: {
    NW: 100,
    W: 90,
    SW: 80,
    default: 40,
  },
};

function makeRaw(
  precipHourly: number[],
  referenceHourStr: string,
  windSpeed = 12,
  windDir = 270
) {
  const count = precipHourly.length;
  const baseDate = new Date(referenceHourStr.split("T")[0] + "T00:00:00.000Z");
  const time: string[] = [];
  const wind_speed_10m: number[] = [];
  const wind_direction_10m: number[] = [];
  const wind_gusts_10m: number[] = [];
  const temperature_2m: number[] = [];
  const cloud_cover: number[] = [];

  for (let i = 0; i < count; i++) {
    time.push(new Date(baseDate.getTime() + i * 3600_000).toISOString());
    wind_speed_10m.push(windSpeed);
    wind_direction_10m.push(windDir);
    wind_gusts_10m.push(Math.round(windSpeed * 1.2));
    temperature_2m.push(22);
    cloud_cover.push(10);
  }

  return {
    latitude: 43.0, longitude: 10.8, generationtime_ms: 5, utc_offset_seconds: 0,
    timezone: "UTC", timezone_abbreviation: "UTC", elevation: 10,
    providerModel: "TEST",
    hourly: {
      time,
      wind_speed_10m,
      wind_direction_10m,
      wind_gusts_10m,
      temperature_2m,
      cloud_cover,
      precipitation: precipHourly,
    },
  };
}

describe("precipitationPreviousHourMm — no interpolation, uses next-bucket semantic", () => {
  it("rain stops at hour H: at H+0:30, precipitation reflects the new dry bucket", () => {
    // precipitation[4]=3mm (rain during 03-04Z), precipitation[5]=0 (dry during 04-05Z)
    const precip = [0, 0, 0, 0, 3.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const refTime = new Date("2026-08-12T04:30:00.000Z"); // between 04:00Z and 05:00Z
    const raw = makeRaw(precip, "2026-08-12T04:30:00.000Z");
    const fc = normalizeSpotForecastGeneric(mockSpot, raw as any, refTime, "UTC");

    // The interval [04:00, 05:00) is reported at bucket 05:00Z (index 5) = 0mm
    expect(fc.current.precipitationPreviousHourMm).toBe(0);
  });

  it("rain starts at hour H: at H-0:15 (within the dry bucket interval), precipitation is 0", () => {
    // precipitation[5]=0 (dry during 04-05Z), precipitation[6]=4mm (rain during 05-06Z)
    const precip = [0, 0, 0, 0, 0, 0, 4.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const refTime = new Date("2026-08-12T04:45:00.000Z"); // between 04:00Z and 05:00Z
    const raw = makeRaw(precip, "2026-08-12T04:45:00.000Z");
    const fc = normalizeSpotForecastGeneric(mockSpot, raw as any, refTime, "UTC");

    // Bucket at 05:00Z (index 5) = 0mm (dry interval)
    expect(fc.current.precipitationPreviousHourMm).toBe(0);
  });

  it("at exact hourly boundary, uses that hour's bucket directly", () => {
    // precipitation[5]=2.5 (rain during 04-05Z)
    const precip = [0, 0, 0, 0, 0, 2.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const refTime = new Date("2026-08-12T05:00:00.000Z"); // exactly at 05:00Z
    const raw = makeRaw(precip, "2026-08-12T05:00:00.000Z");
    const fc = normalizeSpotForecastGeneric(mockSpot, raw as any, refTime, "UTC");

    // At exactly 05:00Z, nextIdx finds bucket at 05:00Z: precipitation = 2.5mm
    expect(fc.current.precipitationPreviousHourMm).toBe(2.5);
  });

  it("does NOT interpolate between two non-zero consecutive buckets", () => {
    // precipitation[4]=2mm (rain 03-04Z), precipitation[5]=4mm (rain 04-05Z)
    const precip = [0, 0, 0, 0, 2.0, 4.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const refTime = new Date("2026-08-12T04:30:00.000Z"); // between 04:00Z and 05:00Z
    const raw = makeRaw(precip, "2026-08-12T04:30:00.000Z");
    const fc = normalizeSpotForecastGeneric(mockSpot, raw as any, refTime, "UTC");

    // Must be exactly the next-bucket value (4.0), not interpolated (2 + 0.5*(4-2) = 3.0)
    expect(fc.current.precipitationPreviousHourMm).toBe(4.0);
  });
});

import { describe, it, expect } from "vitest";
import { MaremmaRegion } from "@/regions/maremma";
import { getRegion, isValidRegionId } from "@/regions/registry";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SpotResult } from "@/types/weather";

describe("Maremma Edition: Multi-Region Plugin & Scenarios", () => {
  describe("Region Registry & Configuration Integrity", () => {
    it("registers Maremma region in central registry with Europe/Rome timezone", () => {
      expect(isValidRegionId("maremma")).toBe(true);
      const region = getRegion("maremma");
      expect(region.id).toBe("maremma");
      expect(region.metadata.displayName).toBe("Maremma");
      expect(region.metadata.editionTitle).toBe("Maremma Edition");
      expect(region.metadata.country).toBe("Italy");
      expect(region.timezone).toBe("Europe/Rome");
      expect(region.defaultSpotId).toBe("talamone");
    });

    it("includes the 5 MVP spots with valid coordinates and hard gates", () => {
      const spotIds = MaremmaRegion.spots.map((s) => s.id);
      expect(spotIds).toEqual([
        "talamone",
        "punta-ala",
        "marina-di-grosseto",
        "giannella",
        "castiglione-della-pescaia",
      ]);

      for (const spot of MaremmaRegion.spots) {
        expect(spot.latitude).toBeGreaterThan(42.0);
        expect(spot.latitude).toBeLessThan(43.5);
        expect(spot.longitude).toBeGreaterThan(10.0);
        expect(spot.longitude).toBeLessThan(12.0);
        expect(spot.qualityCurve.length).toBeGreaterThanOrEqual(4);
        expect(spot.idealDirections.length).toBeGreaterThan(0);
        expect(spot.localCorrection.minFactor).toBeLessThanOrEqual(spot.localCorrection.maxFactor);
        expect(spot.hardGates?.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("defines non-empty wind regimes and explanation rules", () => {
      expect(MaremmaRegion.regimes.length).toBeGreaterThanOrEqual(5);
      const regimeIds = MaremmaRegion.regimes.map((r) => r.id);
      expect(regimeIds).toContain("MAESTRALE");
      expect(regimeIds).toContain("LIBECCIO");
      expect(regimeIds).toContain("PONENTE");

      expect(MaremmaRegion.explanationRules.length).toBeGreaterThanOrEqual(5);
    });
  });

  function generateMaremmaRawData(
    baseSpeed: number,
    baseDirection: number,
    gustMultiplier = 1.25,
    hoursCount = 48
  ): OpenMeteoRawResponse {
    const times: string[] = [];
    const speeds: number[] = [];
    const dirs: number[] = [];
    const gusts: number[] = [];
    const temps: number[] = [];
    const clouds: number[] = [];

    const baseDate = new Date("2026-08-10T00:00:00.000Z");

    for (let h = 0; h < hoursCount; h++) {
      const dt = new Date(baseDate.getTime() + h * 3600000);
      times.push(dt.toISOString());
      speeds.push(baseSpeed);
      dirs.push(baseDirection);
      gusts.push(baseSpeed * gustMultiplier);
      temps.push(29);
      clouds.push(5);
    }

    return {
      latitude: 42.6,
      longitude: 11.0,
      generationtime_ms: 0.5,
      utc_offset_seconds: 0,
      timezone: "UTC",
      timezone_abbreviation: "UTC",
      elevation: 5,
      hourly_units: {
        time: "iso8601",
        wind_speed_10m: "knots",
        wind_direction_10m: "degrees",
        wind_gusts_10m: "knots",
        temperature_2m: "°C",
        cloud_cover: "%",
      },
      hourly: {
        time: times,
        wind_speed_10m: speeds,
        wind_direction_10m: dirs,
        wind_gusts_10m: gusts,
        temperature_2m: temps,
        cloud_cover: clouds,
      },
    };
  }

  describe("Scenario A: Moderate NW / Maestrale", () => {
    it("evaluates Maestrale flow producing valid recommendations across Maremma spots", () => {
      // 20 kt NW (315°) flow
      const raw = generateMaremmaRawData(20, 315);
      const refDate = new Date("2026-08-10T12:00:00.000Z"); // 14:00 Rome time

      const spotsResults: Record<string, SpotResult> = {};
      for (const spot of MaremmaRegion.spots) {
        const fc = normalizeSpotForecastGeneric(spot, raw, refDate, "Europe/Rome");
        spotsResults[spot.id] = { status: "ok", data: fc };
      }

      const recommendation = RecommendationEngine.run(MaremmaRegion, spotsResults, refDate);

      expect(recommendation.bestSpot).not.toBeNull();
      expect(recommendation.score).toBeGreaterThanOrEqual(75);
      expect(recommendation.regimeLabel).toBe("Maestrale");
      expect(Object.keys(recommendation.spotScores).length).toBe(5);
    });
  });

  describe("Scenario B: Moderate SW / Libeccio", () => {
    it("evaluates Libeccio flow activating open-coast spots", () => {
      // 22 kt SW (225°) flow
      const raw = generateMaremmaRawData(22, 225);
      const refDate = new Date("2026-08-10T11:00:00.000Z"); // 13:00 Rome time

      const spotsResults: Record<string, SpotResult> = {};
      for (const spot of MaremmaRegion.spots) {
        const fc = normalizeSpotForecastGeneric(spot, raw, refDate, "Europe/Rome");
        spotsResults[spot.id] = { status: "ok", data: fc };
      }

      const recommendation = RecommendationEngine.run(MaremmaRegion, spotsResults, refDate);

      expect(recommendation.bestSpot).not.toBeNull();
      expect(recommendation.regimeLabel).toBe("Libeccio");
      expect(recommendation.bestWindow).not.toBeNull();
    });
  });

  describe("Scenario C: Weak Summer Flow with Afternoon Thermal Reinforcement", () => {
    it("accelerates Talamone during summer afternoon thermal hours", () => {
      // 10 kt NW (315°) synoptic flow in August
      const raw = generateMaremmaRawData(10, 315);
      const refDate = new Date("2026-08-10T13:00:00.000Z"); // 15:00 Rome time (peak thermal)

      const talamoneSpot = MaremmaRegion.spots.find((s) => s.id === "talamone")!;
      const forecast = normalizeSpotForecastGeneric(talamoneSpot, raw, refDate, "Europe/Rome");

      // Hour 13 UTC (15:00 Rome) receives base (1.05) + dynamic thermal boost (~0.19) = ~1.24 factor
      const afternoonHour = forecast.hourly[13];
      expect(afternoonHour.correctionFactor).toBeGreaterThanOrEqual(1.20);
      expect(afternoonHour.localWind).toBeGreaterThanOrEqual(12.0);
    });
  });

  describe("Scenario D: No Valid Session Window", () => {
    it("returns null bestSpot when all spots are in calm/unplaning conditions", () => {
      // 4 kt calm wind
      const raw = generateMaremmaRawData(4, 315);
      const refDate = new Date("2026-08-10T12:00:00.000Z");

      const spotsResults: Record<string, SpotResult> = {};
      for (const spot of MaremmaRegion.spots) {
        const fc = normalizeSpotForecastGeneric(spot, raw, refDate, "Europe/Rome");
        spotsResults[spot.id] = { status: "ok", data: fc };
      }

      const recommendation = RecommendationEngine.run(MaremmaRegion, spotsResults, refDate);

      expect(recommendation.bestSpot).toBeNull();
      expect(recommendation.score).toBe(0);
      expect(recommendation.bestWindow).toBeNull();
    });
  });

  describe("Scenario E: Partial Spot Failure Resilience", () => {
    it("continues recommendation even if some Maremma spots fail to fetch", () => {
      const raw = generateMaremmaRawData(18, 315);
      const refDate = new Date("2026-08-10T12:00:00.000Z");

      const spotsResults: Record<string, SpotResult> = {};
      MaremmaRegion.spots.forEach((spot, idx) => {
        if (idx === 0) {
          spotsResults[spot.id] = {
            status: "error",
            message: "Network timeout",
            spot: {
              id: spot.id,
              name: spot.name,
              latitude: spot.latitude,
              longitude: spot.longitude,
            },
          };
        } else {
          const fc = normalizeSpotForecastGeneric(spot, raw, refDate, "Europe/Rome");
          spotsResults[spot.id] = { status: "ok", data: fc };
        }
      });

      const recommendation = RecommendationEngine.run(MaremmaRegion, spotsResults, refDate);

      expect(recommendation.bestSpot).not.toBeNull();
      expect(recommendation.bestSpot).not.toBe("talamone");
      expect(recommendation.spotScores["talamone"]).toBeNull();
    });
  });

  describe("Offshore Direction Safety Hard Gates", () => {
    it("marks spots UNSUITABLE under hazardous offshore East wind (90°)", () => {
      // 22 kt East (90°) wind (strong offshore for Talamone, Punta Ala, Marina di Grosseto, Castiglione)
      const raw = generateMaremmaRawData(22, 90);
      const refDate = new Date("2026-08-10T12:00:00.000Z");

      const spotsResults: Record<string, SpotResult> = {};
      for (const spot of MaremmaRegion.spots) {
        const fc = normalizeSpotForecastGeneric(spot, raw, refDate, "Europe/Rome");
        spotsResults[spot.id] = { status: "ok", data: fc };
      }

      const rec = RecommendationEngine.run(MaremmaRegion, spotsResults, refDate);

      // Talamone, Punta Ala, Marina di Grosseto, Castiglione must be hard-gated with score 0
      expect(rec.spotScores["talamone"]).toBe(0);
      expect(rec.spotScores["punta-ala"]).toBe(0);
      expect(rec.spotScores["marina-di-grosseto"]).toBe(0);
      expect(rec.spotScores["castiglione-della-pescaia"]).toBe(0);
    });
  });

  describe("Unmatched Regime Fallback", () => {
    it("returns neutral 'OTHER_FLOW' / 'Variable Airflow' when conditions do not match any defined regime", () => {
      // 11 kt SE (135°) which does not match Scirocco (min 12kt) or other regimes
      const raw = generateMaremmaRawData(11, 135);
      const refDate = new Date("2026-08-10T12:00:00.000Z");

      const spotsResults: Record<string, SpotResult> = {};
      for (const spot of MaremmaRegion.spots) {
        const fc = normalizeSpotForecastGeneric(spot, raw, refDate, "Europe/Rome");
        spotsResults[spot.id] = { status: "ok", data: fc };
      }

      const rec = RecommendationEngine.run(MaremmaRegion, spotsResults, refDate);
      expect(rec.regime).toBe("OTHER_FLOW");
      expect(rec.regimeLabel).toBe("Variable Airflow");
    });
  });

  describe("Tomorrow's Independent Recommendation", () => {
    it("evaluates tomorrow's session rankings independently across all 5 spots", () => {
      const raw = generateMaremmaRawData(20, 315, 1.2, 48);
      const todayDate = new Date("2026-08-10T12:00:00.000Z");
      const tomorrowDate = new Date("2026-08-11T12:00:00.000Z");

      const spotsResults: Record<string, SpotResult> = {};
      for (const spot of MaremmaRegion.spots) {
        const fc = normalizeSpotForecastGeneric(spot, raw, todayDate, "Europe/Rome");
        spotsResults[spot.id] = { status: "ok", data: fc };
      }

      const tomorrowRec = RecommendationEngine.run(MaremmaRegion, spotsResults, tomorrowDate);
      expect(tomorrowRec.bestSpot).not.toBeNull();
      expect(Object.keys(tomorrowRec.spotScores).length).toBe(5);
    });
  });
});

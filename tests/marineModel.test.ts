import { describe, it, expect } from "vitest";
import {
  calculateExposureScore,
  calculateWaveAlignmentScore,
  calculatePeriodOrganizationScore,
  calculateWaveHeightQualityScore,
  classifySeaState,
  evaluateSeaState,
  evaluateFallbackSeaState,
} from "@/engine/marine/SeaStateEvaluator";
import { RegionSpotConfig } from "@/types/region";
import { MarineForecastPoint } from "@/types/marine";
import { MaremmaSpots } from "@/regions/maremma/spots";
import { EasternCreteSpots } from "@/regions/eastern-crete/spots";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";

describe("Sea State Model & Evaluator", () => {
  const puntaAla = MaremmaSpots.find((s) => s.id === "punta-ala")!;
  const talamone = MaremmaSpots.find((s) => s.id === "talamone")!;
  const tenda = EasternCreteSpots.find((s) => s.id === "tenda")!;

  describe("Coastal Exposure Evaluation", () => {
    it("returns high exposure score for directly exposed swell directions", () => {
      // Punta Ala is fully exposed to SW (factor 1.0)
      const swScore = calculateExposureScore(puntaAla.seaProfile, 225); // SW
      expect(swScore).toBe(100);
    });

    it("attenuates swell score for sheltered bay directions", () => {
      // Talamone attenuates SW swell (factor 0.40)
      const swScore = calculateExposureScore(talamone.seaProfile, 225); // SW
      expect(swScore).toBeLessThanOrEqual(45);
    });

    it("interpolates proximity for intermediate wave directions", () => {
      const wswScore = calculateExposureScore(puntaAla.seaProfile, 240);
      expect(wswScore).toBeGreaterThanOrEqual(90);
    });
  });

  describe("Wave Direction Alignment", () => {
    it("returns 100 for perfectly aligned preferred swell angle", () => {
      const score = calculateWaveAlignmentScore(puntaAla.seaProfile, 225); // SW
      expect(score).toBe(100);
    });

    it("reduces score for misaligned wave direction", () => {
      const score = calculateWaveAlignmentScore(puntaAla.seaProfile, 90); // E (completely unaligned)
      expect(score).toBeLessThanOrEqual(25);
    });
  });

  describe("Wave Period / Organization Score", () => {
    it("penalizes short disorganized chop (< 4.5s)", () => {
      const score = calculatePeriodOrganizationScore(4.0, puntaAla.seaProfile);
      expect(score).toBeLessThanOrEqual(40);
    });

    it("rewards clean organized swell (7s - 10s)", () => {
      const score = calculatePeriodOrganizationScore(8.5, puntaAla.seaProfile);
      expect(score).toBe(100);
    });
  });

  describe("Wave Height Quality Curve", () => {
    it("evaluates custom height quality curve at wave spots", () => {
      // Punta Ala height quality curve: 1.6m -> score 100
      const score16 = calculateWaveHeightQualityScore(1.6, puntaAla.seaProfile);
      expect(score16).toBe(100);

      // 0.2m -> score 20
      const score02 = calculateWaveHeightQualityScore(0.2, puntaAla.seaProfile);
      expect(score02).toBe(20);
    });
  });

  describe("Sea State Physical Classification", () => {
    it("classifies small waves (< 0.45m) with strong wind as CHOP or FLAT", () => {
      const state = classifySeaState(0.3, 4.0, 100, 100, 20);
      expect(state).toBe("CHOP");

      const flatState = classifySeaState(0.3, 4.0, 100, 100, 12);
      expect(flatState).toBe("FLAT");
    });

    it("classifies clean 1.5m waves with 8s period and good exposure as WAVE", () => {
      const state = classifySeaState(1.5, 8.0, 100, 100, 22);
      expect(state).toBe("WAVE");
    });

    it("classifies disorganized 1.5m sea with 4.0s short period as CHOP / BUMP_AND_JUMP", () => {
      const state = classifySeaState(1.5, 4.0, 100, 100, 26);
      expect(state).toBe("CHOP");
    });
  });

  describe("Specification Synthetic Scenarios A–E", () => {
    it("Scenario A: 20 kt wind, 0.2m wave at wave spot -> low Sea Quality", () => {
      const marinePoint: MarineForecastPoint = {
        timestamp: "2026-08-11T12:00:00.000Z",
        waveHeight: 0.2,
        wavePeriod: 4.0,
        waveDirection: 225,
        provider: "ECMWF WAM",
      };

      const result = evaluateSeaState(puntaAla, marinePoint, 20, "SW");
      expect(result.seaQualityScore).toBeLessThan(50);
      expect(result.state).not.toBe("WAVE");
    });

    it("Scenario B: 20 kt wind, 1.5m waves, 8s period, aligned SW swell -> high Sea Quality & WAVE", () => {
      const marinePoint: MarineForecastPoint = {
        timestamp: "2026-08-11T12:00:00.000Z",
        waveHeight: 1.5,
        wavePeriod: 8.0,
        waveDirection: 225, // SW
        provider: "ECMWF WAM",
      };

      const result = evaluateSeaState(puntaAla, marinePoint, 20, "SW");
      expect(result.seaQualityScore).toBeGreaterThanOrEqual(85);
      expect(result.state).toBe("WAVE");
      expect(result.source).toBe("MARINE_FORECAST");
    });

    it("Scenario C: 20 kt wind, 1.5m waves, 8s period, unaligned swell (East) -> reduced Sea Quality", () => {
      const marinePoint: MarineForecastPoint = {
        timestamp: "2026-08-11T12:00:00.000Z",
        waveHeight: 1.5,
        wavePeriod: 8.0,
        waveDirection: 90, // E (wrong swell direction)
        provider: "ECMWF WAM",
      };

      const result = evaluateSeaState(puntaAla, marinePoint, 20, "SW");
      expect(result.seaQualityScore).toBeLessThan(60);
      expect(result.alignmentScore).toBeLessThanOrEqual(25);
    });

    it("Scenario D: strong wind, large disorganized 4s sea -> CHOP, not high-quality WAVE", () => {
      const marinePoint: MarineForecastPoint = {
        timestamp: "2026-08-11T12:00:00.000Z",
        waveHeight: 1.8,
        wavePeriod: 4.2, // short disorganized chop
        waveDirection: 225,
        provider: "ECMWF WAM",
      };

      const result = evaluateSeaState(puntaAla, marinePoint, 26, "SW");
      expect(result.state).not.toBe("WAVE");
      expect(result.organizationScore).toBeLessThan(50);
    });

    it("Scenario E: Marine provider unavailable -> fallback WaterState, recommendation succeeds", () => {
      const fallback = evaluateFallbackSeaState(puntaAla, 22, "SW");
      expect(fallback.source).toBe("WIND_DERIVED_FALLBACK");
      expect(fallback.confidence).toBe(50);
      expect(fallback.waveHeight).toBeGreaterThan(0);
      expect(fallback.state).toBe("WAVE");
    });
  });

  describe("Pipeline Forecast Normalizer Integration", () => {
    const rawWeather: OpenMeteoRawResponse = {
      latitude: 42.81,
      longitude: 10.745,
      generationtime_ms: 10,
      utc_offset_seconds: 7200,
      timezone: "Europe/Rome",
      timezone_abbreviation: "CEST",
      elevation: 5,
      providerModel: "ECMWF IFS HRES",
      hourly: {
        time: [
          "2026-08-11T10:00:00.000Z",
          "2026-08-11T11:00:00.000Z",
          "2026-08-11T12:00:00.000Z",
          "2026-08-11T13:00:00.000Z",
        ],
        wind_speed_10m: [18, 20, 22, 21],
        wind_direction_10m: [225, 225, 230, 225],
        wind_gusts_10m: [22, 25, 27, 26],
        temperature_2m: [27, 28, 28, 27],
        cloud_cover: [10, 10, 15, 10],
      },
    };

    const marineForecast = {
      latitude: 42.81,
      longitude: 10.745,
      providerModel: "ECMWF WAM (via Open-Meteo)",
      points: [
        {
          timestamp: "2026-08-11T10:00:00.000Z",
          waveHeight: 1.4,
          wavePeriod: 7.5,
          waveDirection: 225,
          provider: "ECMWF WAM",
        },
        {
          timestamp: "2026-08-11T11:00:00.000Z",
          waveHeight: 1.6,
          wavePeriod: 8.0,
          waveDirection: 225,
          provider: "ECMWF WAM",
        },
        {
          timestamp: "2026-08-11T12:00:00.000Z",
          waveHeight: 1.7,
          wavePeriod: 8.2,
          waveDirection: 225,
          provider: "ECMWF WAM",
        },
        {
          timestamp: "2026-08-11T13:00:00.000Z",
          waveHeight: 1.5,
          wavePeriod: 7.8,
          waveDirection: 225,
          provider: "ECMWF WAM",
        },
      ],
    };

    it("merges wind and marine forecast points and produces daily marine aggregates", () => {
      const forecast = normalizeSpotForecastGeneric(
        puntaAla,
        rawWeather,
        new Date("2026-08-11T11:30:00.000Z"),
        "Europe/Rome",
        undefined,
        marineForecast
      );

      expect(forecast.hourly.length).toBe(4);
      expect(forecast.hourly[0].seaState?.source).toBe("MARINE_FORECAST");
      expect(forecast.hourly[0].seaState?.waveHeight).toBe(1.4);
      expect(forecast.hourly[0].waterState).toBe("WAVE");
      expect(forecast.days[0].waveHeightRange).toBeDefined();
      expect(forecast.days[0].waveHeightRange?.min).toBe(1.4);
      expect(forecast.days[0].waveHeightRange?.max).toBe(1.7);
      expect(forecast.days[0].dominantSeaState).toBe("WAVE");
    });

    it("interpolates current conditions without double-attenuating coastal wave height for sheltered spots", () => {
      // Talamone has exposure factor 0.40 for SW 225°
      // At 11:00 UTC (1.6m raw) -> hourly waveHeight = 1.6 * 0.40 = 0.64 -> 0.6m
      // At 12:00 UTC (1.7m raw) -> hourly waveHeight = 1.7 * 0.40 = 0.68 -> 0.7m
      // Current condition at 11:30 UTC interpolates raw 1.65m -> single attenuation gives 1.65 * 0.40 = 0.66 -> 0.7m
      // (If double-attenuated, it would have been ~0.65 * 0.40 = 0.26m -> 0.3m!)
      const forecast = normalizeSpotForecastGeneric(
        talamone,
        rawWeather,
        new Date("2026-08-11T11:30:00.000Z"),
        "Europe/Rome",
        undefined,
        marineForecast
      );

      expect(forecast.current.seaState?.source).toBe("MARINE_FORECAST");
      expect(forecast.current.seaState?.waveHeight).toBe(0.7);
      expect(forecast.current.seaState?.rawWaveHeight).toBe(1.7); // 1.65 rounded to 1.7
    });

    it("falls back cleanly when marine forecast is null", () => {
      const forecast = normalizeSpotForecastGeneric(
        puntaAla,
        rawWeather,
        new Date("2026-08-11T11:30:00.000Z"),
        "Europe/Rome",
        undefined,
        null
      );

      expect(forecast.hourly.length).toBe(4);
      expect(forecast.hourly[0].seaState?.source).toBe("WIND_DERIVED_FALLBACK");
      expect(forecast.current.seaState?.source).toBe("WIND_DERIVED_FALLBACK");
      expect(forecast.current.seaState?.rawWaveHeight).toBeNull();
      expect(forecast.days[0].score).toBeGreaterThan(0);
    });
  });
});

import { describe, it, expect } from "vitest";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { EasternCreteRegion } from "@/regions/eastern-crete";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SpotResult } from "@/types/weather";

describe("Regression Validation: Generic Normalization & Recommendation Pipeline", () => {
  const kouremenosConfig = EasternCreteRegion.spots.find((s) => s.id === "kouremenos")!;
  const tendaConfig = EasternCreteRegion.spots.find((s) => s.id === "tenda")!;
  const xerokamposConfig = EasternCreteRegion.spots.find((s) => s.id === "xerokampos")!;

  function generateSampleMeltemiRawData(baseSpeed: number, baseDirection: number): any {
    const times: string[] = [];
    const windSpeeds: number[] = [];
    const windDirs: number[] = [];
    const gusts: number[] = [];
    const temps: number[] = [];
    const clouds: number[] = [];

    // 24 hours of forecast for 2026-08-10
    for (let h = 0; h < 24; h++) {
      const hourStr = h.toString().padStart(2, "0");
      times.push(`2026-08-10T${hourStr}:00:00.000Z`);
      windSpeeds.push(baseSpeed);
      windDirs.push(baseDirection);
      gusts.push(baseSpeed * 1.25);
      temps.push(28);
      clouds.push(10);
    }

    return {
      latitude: 35.2,
      longitude: 26.27,
      generationtime_ms: 0.5,
      utc_offset_seconds: 0,
      timezone: "UTC",
      timezone_abbreviation: "UTC",
      elevation: 10,
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
        wind_speed_10m: windSpeeds,
        wind_direction_10m: windDirs,
        wind_gusts_10m: gusts,
        temperature_2m: temps,
        cloud_cover: clouds,
      },
    };
  }

  it("normalizes Kouremenos forecast applying summer and afternoon thermal boost", () => {
    // 16 kt NW (315°) Meltemi base
    const raw = generateSampleMeltemiRawData(16, 315);
    const refDate = new Date("2026-08-10T12:00:00.000Z"); // 15:00 Athens time (afternoon thermal active)

    const forecast = normalizeSpotForecastGeneric(
      kouremenosConfig,
      raw,
      refDate,
      "Europe/Athens"
    );

    expect(forecast).not.toBeNull();
    expect(forecast.spot.id).toBe("kouremenos");
    expect(forecast.hourly.length).toBe(24);

    // Afternoon hour (15:00 Athens -> 12:00 UTC) has thermal boost (+0.15) + summer boost (+0.10) + NW dir (+0.10) + base (1.15) = 1.45 (clamped)
    const afternoonHour = forecast.hourly[12];
    expect(afternoonHour.localWind).toBeGreaterThan(20);
    expect(afternoonHour.directionLabel).toBe("NW");
    expect(afternoonHour.eligibility).toBe("IDEAL");
    expect(afternoonHour.sessionQualityScore).toBeGreaterThanOrEqual(80);

    // Daily summary correctly evaluated
    expect(forecast.days.length).toBeGreaterThan(0);
    const today = forecast.days[0];
    expect(today.dominantDirection).toBe("NW");
    expect(today.bestWindow).not.toBeNull();
    expect(today.bestWindow?.durationHours).toBeGreaterThanOrEqual(2);
  });

  it("normalizes Tenda forecast with Wave ramps in Strong Meltemi", () => {
    // 25 kt NNE (25°) Strong Meltemi base
    const raw = generateSampleMeltemiRawData(25, 25);
    const refDate = new Date("2026-08-10T10:00:00.000Z");

    const forecast = normalizeSpotForecastGeneric(
      tendaConfig,
      raw,
      refDate,
      "Europe/Athens"
    );

    expect(forecast.spot.id).toBe("tenda");
    const activeHour = forecast.hourly[10];
    expect(activeHour.localWind).toBeGreaterThanOrEqual(25);
    expect(activeHour.waterState).toBe("WAVE");
    expect(activeHour.eligibility).toBe("IDEAL");
    expect(activeHour.sessionQualityScore).toBeGreaterThanOrEqual(85);
  });

  it("enforces Hard Gate exclusion on Xerokampos during Meltemi", () => {
    // 20 kt NNW (335°) Meltemi
    const raw = generateSampleMeltemiRawData(20, 335);
    const refDate = new Date("2026-08-10T12:00:00.000Z");

    const forecast = normalizeSpotForecastGeneric(
      xerokamposConfig,
      raw,
      refDate,
      "Europe/Athens",
      "MELTEMI_STRONG"
    );

    // Hard gate marks offshore Meltemi as UNSUITABLE with 0 session quality score
    const hour = forecast.hourly[12];
    expect(hour.eligibility).toBe("UNSUITABLE");
    expect(hour.eligibilityReason).toBe("OFFSHORE_MELTEMI");
    expect(hour.sessionQualityScore).toBe(0);
  });

  it("runs full RecommendationEngine pipeline recommending Tenda in Strong Meltemi", () => {
    const kRaw = generateSampleMeltemiRawData(22, 315); // Kouremenos: ~28 kt (choppy)
    const tRaw = generateSampleMeltemiRawData(26, 340); // Tenda: ~30 kt (Wave sweetspot)
    const xRaw = generateSampleMeltemiRawData(20, 335); // Xerokampos: Meltemi offshore

    const refDate = new Date("2026-08-10T10:00:00.000Z");

    const kForecast = normalizeSpotForecastGeneric(kouremenosConfig, kRaw, refDate, "Europe/Athens");
    const tForecast = normalizeSpotForecastGeneric(tendaConfig, tRaw, refDate, "Europe/Athens");
    const xForecast = normalizeSpotForecastGeneric(xerokamposConfig, xRaw, refDate, "Europe/Athens");

    const spotsResults: Record<string, SpotResult> = {
      kouremenos: { status: "ok", data: kForecast },
      tenda: { status: "ok", data: tForecast },
      xerokampos: { status: "ok", data: xForecast },
    };

    const recommendation = RecommendationEngine.run(EasternCreteRegion, spotsResults, refDate);

    expect(recommendation.bestSpot).toBe("tenda");
    expect(recommendation.bestSpotName).toBe("Tenda");
    expect(recommendation.score).toBeGreaterThan(80);
    expect(recommendation.spotScores["tenda"]).toBeGreaterThan(recommendation.spotScores["kouremenos"]!);
    expect(recommendation.spotScores["xerokampos"]).toBe(0);
    expect(recommendation.bestWindow).not.toBeNull();
    expect(recommendation.explanation.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { AltaToscanaRegion } from "@/regions/alta-toscana";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SpotResult } from "@/types/weather";
import { MarineForecast } from "@/types/marine";

describe("Alta Toscana Edition — Plugin & Scenario Validations", () => {
  it("defines exactly 6 calibrated spots in the region", () => {
    expect(AltaToscanaRegion.spots.length).toBe(6);
    const spotIds = AltaToscanaRegion.spots.map((s) => s.id);
    expect(spotIds).toEqual([
      "calambrone",
      "vada",
      "il-sale",
      "lido-di-camaiore",
      "forte-dei-marmi",
      "castagneto-donoratico",
    ]);
  });

  it("all spots have configured Sea Profiles and hard gates", () => {
    for (const spot of AltaToscanaRegion.spots) {
      expect(spot.seaProfile).toBeDefined();
      expect(spot.seaProfile?.exposureDirections).toBeDefined();
      expect(spot.hardGates).toBeDefined();
    }
  });

  const createSyntheticWeather = (
    windSpeed: number,
    windDirection: number,
    referenceHour = "2026-08-11T13:00:00.000Z",
    hoursCount = 24
  ): OpenMeteoRawResponse => {
    const time: string[] = [];
    const wind_speed_10m: number[] = [];
    const wind_direction_10m: number[] = [];
    const wind_gusts_10m: number[] = [];
    const temperature_2m: number[] = [];
    const cloud_cover: number[] = [];

    const baseDate = new Date(referenceHour.split("T")[0] + "T00:00:00.000Z");

    for (let i = 0; i < hoursCount; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      time.push(d.toISOString());
      wind_speed_10m.push(windSpeed);
      wind_direction_10m.push(windDirection);
      wind_gusts_10m.push(Math.round(windSpeed * 1.25));
      temperature_2m.push(26);
      cloud_cover.push(10);
    }

    return {
      latitude: 43.5,
      longitude: 10.3,
      generationtime_ms: 10,
      utc_offset_seconds: 7200,
      timezone: "Europe/Rome",
      timezone_abbreviation: "CEST",
      elevation: 5,
      providerModel: "ECMWF IFS HRES",
      hourly: {
        time,
        wind_speed_10m,
        wind_direction_10m,
        wind_gusts_10m,
        temperature_2m,
        cloud_cover,
      },
    };
  };

  const createSyntheticMarine = (
    waveHeight: number,
    wavePeriod: number,
    waveDirection: number,
    referenceHour = "2026-08-11T13:00:00.000Z",
    hoursCount = 24
  ): MarineForecast => {
    const points = [];
    const baseDate = new Date(referenceHour.split("T")[0] + "T00:00:00.000Z");

    for (let i = 0; i < hoursCount; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      points.push({
        timestamp: d.toISOString(),
        waveHeight,
        wavePeriod,
        waveDirection,
        provider: "ECMWF WAM",
      });
    }

    return {
      latitude: 43.5,
      longitude: 10.3,
      providerModel: "ECMWF WAM",
      points,
    };
  };

  const runScenario = (
    windSpeed: number,
    windDirection: number,
    marine?: { waveHeight: number; wavePeriod: number; waveDirection: number },
    referenceHour = "2026-08-11T13:00:00.000Z"
  ) => {
    const rawWeather = createSyntheticWeather(windSpeed, windDirection, referenceHour);
    const rawMarine = marine
      ? createSyntheticMarine(marine.waveHeight, marine.wavePeriod, marine.waveDirection, referenceHour)
      : null;

    const refDate = new Date(referenceHour);
    const spotsResults: Record<string, SpotResult> = {};

    for (const spot of AltaToscanaRegion.spots) {
      const forecast = normalizeSpotForecastGeneric(
        spot,
        rawWeather,
        refDate,
        AltaToscanaRegion.timezone,
        undefined,
        rawMarine
      );
      spotsResults[spot.id] = { status: "ok", data: forecast };
    }

    const rec = RecommendationEngine.run(AltaToscanaRegion, spotsResults, refDate);
    return { rec, spotsResults };
  };

  describe("Scenario A: Moderate NW Maestrale (20 kt NW / 315°)", () => {
    it("Vada and Calambrone emerge as primary candidates under Maestrale", () => {
      const { rec, spotsResults } = runScenario(20, 315, {
        waveHeight: 1.1,
        wavePeriod: 6.5,
        waveDirection: 315,
      });

      expect(rec.regime).toBe("MAESTRALE");
      expect(rec.bestSpot).toBe("vada");
      expect(rec.score).toBeGreaterThanOrEqual(80);

      const vadaScore = spotsResults["vada"].status === "ok" ? spotsResults["vada"].data.days[0].score : 0;
      const calambroneScore = spotsResults["calambrone"].status === "ok" ? spotsResults["calambrone"].data.days[0].score : 0;
      expect(vadaScore).toBeGreaterThanOrEqual(80);
      expect(calambroneScore).toBeGreaterThanOrEqual(75);
    });
  });

  describe("Scenario B: Strong Libeccio & Large SW Swell (25 kt SW / 225°, 2.0m 8s swell)", () => {
    it("Il Sale becomes preferred wave arena with highest wave quality", () => {
      const { rec, spotsResults } = runScenario(25, 225, {
        waveHeight: 2.0,
        wavePeriod: 8.0,
        waveDirection: 225,
      });

      expect(rec.regime).toBe("LIBECCIO");
      expect(rec.bestSpot).toBe("il-sale");
      expect(rec.sailingStyle).toBe("WAVE");
      expect(rec.score).toBeGreaterThanOrEqual(85);

      const ilSaleForecast = (spotsResults["il-sale"] as any).data;
      expect(ilSaleForecast.current.seaState.state).toBe("WAVE");
      expect(ilSaleForecast.current.seaState.seaQualityScore).toBeGreaterThanOrEqual(85);
    });
  });

  describe("Scenario C: Moderate Libeccio (18 kt SW / 225°, 1.2m 6.5s swell)", () => {
    it("Versilia spots (Lido di Camaiore & Forte dei Marmi) are competitive with clean wave ramps", () => {
      const { rec, spotsResults } = runScenario(18, 225, {
        waveHeight: 1.2,
        wavePeriod: 6.5,
        waveDirection: 225,
      });

      expect(rec.regime).toBe("LIBECCIO");
      const lidoScore = (spotsResults["lido-di-camaiore"] as any).data.days[0].score;
      const forteScore = (spotsResults["forte-dei-marmi"] as any).data.days[0].score;
      expect(lidoScore).toBeGreaterThanOrEqual(70);
      expect(forteScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe("Scenario D: Weak Summer Gradient with Calambrone Thermal Boost", () => {
    it("Calambrone activates dynamic thermal in the afternoon (14:00)", () => {
      // 10 kt synoptic WNW in July afternoon
      const { spotsResults } = runScenario(
        10,
        290,
        { waveHeight: 0.4, wavePeriod: 4.5, waveDirection: 290 },
        "2026-07-15T13:00:00.000Z" // 15:00 local time CEST
      );

      const calambrone = (spotsResults["calambrone"] as any).data;
      // Local wind should be accelerated above synoptic 10 kt due to base + thermal boost
      expect(calambrone.current.localWind).toBeGreaterThan(11);
      expect(calambrone.current.correctionFactor).toBeGreaterThan(1.10);
    });
  });
});

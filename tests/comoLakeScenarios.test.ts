import { describe, it, expect } from "vitest";
import { ComoLakeRegion } from "@/regions/como-lake";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import {
  RecommendationEngine,
  classifyRegionalRegimeForHour,
} from "@/engine/recommendation/RecommendationEngine";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SpotResult } from "@/types/weather";
import { isSpotOperatingHour } from "@/lib/solar";

describe("Como Lake Edition — Plugin & Scenario Validations", () => {
  it("defines exactly 6 calibrated spots in the region", () => {
    expect(ComoLakeRegion.spots.length).toBe(6);
    const spotIds = ComoLakeRegion.spots.map((s) => s.id);
    expect(spotIds).toEqual([
      "valmadrera-pare",
      "dervio",
      "colico",
      "gera-lario",
      "cremia",
      "gravedona",
    ]);
  });

  it("all spots have configured Lake Profiles and hard gates", () => {
    for (const spot of ComoLakeRegion.spots) {
      expect(spot.lakeProfile).toBeDefined();
      expect(spot.lakeProfile?.fetchByDirectionKm).toBeDefined();
      expect(spot.hardGates).toBeDefined();
    }
  });

  const createSyntheticWeather = (
    windSpeed: number,
    windDirection: number,
    referenceHour = "2026-08-12T05:00:00.000Z",
    precipitation12h = 0,
    hoursCount = 24
  ): OpenMeteoRawResponse => {
    const time: string[] = [];
    const wind_speed_10m: number[] = [];
    const wind_direction_10m: number[] = [];
    const wind_gusts_10m: number[] = [];
    const temperature_2m: number[] = [];
    const cloud_cover: number[] = [];
    const precipitation: number[] = [];

    const baseDate = new Date(referenceHour.split("T")[0] + "T00:00:00.000Z");

    for (let i = 0; i < hoursCount; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      time.push(d.toISOString());
      wind_speed_10m.push(windSpeed);
      wind_direction_10m.push(windDirection);
      wind_gusts_10m.push(Math.round(windSpeed * 1.25));
      temperature_2m.push(22);
      cloud_cover.push(10);
      // Allocate precipitation to past hours if specified
      precipitation.push(i < 6 && precipitation12h > 0 ? precipitation12h / 6 : 0);
    }

    return {
      latitude: 46.0,
      longitude: 9.3,
      generationtime_ms: 10,
      utc_offset_seconds: 7200,
      timezone: "Europe/Rome",
      timezone_abbreviation: "CEST",
      elevation: 200,
      providerModel: "ECMWF IFS HRES",
      hourly: {
        time,
        wind_speed_10m,
        wind_direction_10m,
        wind_gusts_10m,
        temperature_2m,
        cloud_cover,
        precipitation,
      },
    };
  };

  const runScenario = (
    windSpeed: number,
    windDirection: number,
    referenceHour = "2026-08-12T05:00:00.000Z",
    precipitation12h = 0,
    overrideRegime?: string
  ) => {
    const rawWeather = createSyntheticWeather(windSpeed, windDirection, referenceHour, precipitation12h);
    const refDate = new Date(referenceHour);
    const count = rawWeather.hourly.time.length;

    // Compute hourly regimes pre-normalization just like route.ts
    const hourlyRegimes: string[] = [];
    for (let i = 0; i < count; i++) {
      if (overrideRegime) {
        hourlyRegimes.push(overrideRegime);
      } else {
        const timeStr = rawWeather.hourly.time[i];
        let localH = 12;
        try {
          const hStr = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Rome",
            hour: "2-digit",
            hour12: false,
          }).format(new Date(timeStr));
          localH = parseInt(hStr, 10);
        } catch {}

        const { regimeId } = classifyRegionalRegimeForHour(ComoLakeRegion, {
          meanRawWind: rawWeather.hourly.wind_speed_10m[i],
          meanDirectionDegrees: rawWeather.hourly.wind_direction_10m[i],
          precipitation12hMm: precipitation12h,
          currentPrecipitationMm: 0,
          localHour: localH,
        });
        hourlyRegimes.push(regimeId);
      }
    }

    const spotsResults: Record<string, SpotResult> = {};

    for (const spot of ComoLakeRegion.spots) {
      const forecast = normalizeSpotForecastGeneric(
        spot,
        rawWeather,
        refDate,
        ComoLakeRegion.timezone,
        hourlyRegimes,
        null // Lake Como skips ECMWF-WAM marine model
      );
      spotsResults[spot.id] = { status: "ok", data: forecast };
    }

    const rec = RecommendationEngine.run(ComoLakeRegion, spotsResults, refDate);
    return { rec, spotsResults };
  };

  describe("Scenario 1: Valmadrera Tivano Morning Thermal", () => {
    it("detects Tivano and boosts Valmadrera local wind during morning NE flow (07:00 local CEST = 05:00 UTC)", () => {
      const { rec, spotsResults } = runScenario(12, 35, "2026-08-12T05:00:00.000Z", 0);

      expect(rec.regime).toBe("COMO_TIVANO");
      expect(rec.bestSpot).toBe("valmadrera-pare");
      expect(rec.score).toBeGreaterThanOrEqual(80);

      const valmadrera = (spotsResults["valmadrera-pare"] as any).data;
      expect(valmadrera.current.localWind).toBeGreaterThan(14.5);
      expect(valmadrera.current.lakeStateSource).toBe("LAKE_WIND_DERIVED");
    });

    it("does not apply Tivano boost when morning wind is from the south, triggering Valmadrera shadow gate", () => {
      const { spotsResults } = runScenario(10, 180, "2026-08-12T05:00:00.000Z", 0);
      const valmadrera = (spotsResults["valmadrera-pare"] as any).data;

      // Valmadrera is hard-gated for southerly wind shadow
      expect(valmadrera.current.eligibility).toBe("UNSUITABLE");
    });
  });

  describe("Scenario 2: Valmadrera Post-Rain Northerly Drainage", () => {
    it("detects post-rain North only when rainfall is present and applies drainage boost", () => {
      const { rec, spotsResults } = runScenario(14, 25, "2026-08-12T05:00:00.000Z", 6.0);

      expect(rec.regime).toBe("COMO_POST_RAIN_NORTH");
      expect(rec.bestSpot).toBe("valmadrera-pare");

      const valmadrera = (spotsResults["valmadrera-pare"] as any).data;
      expect(valmadrera.current.localWind).toBeGreaterThan(17);
    });

    it("does NOT classify as post-rain North when rainfall is zero", () => {
      const { rec } = runScenario(14, 25, "2026-08-12T05:00:00.000Z", 0);

      expect(rec.regime).not.toBe("COMO_POST_RAIN_NORTH");
      expect(rec.regime).toBe("COMO_TIVANO");
    });
  });

  describe("Scenario 3: Dervio Breva Afternoon Thermal", () => {
    it("detects Breva in the afternoon under southerly flow (14:00 local CEST = 12:00 UTC)", () => {
      const { rec, spotsResults } = runScenario(16, 190, "2026-08-12T12:00:00.000Z", 0);

      expect(rec.regime).toBe("COMO_BREVA");
      expect(rec.bestSpot).toBe("dervio");
      expect(rec.score).toBeGreaterThanOrEqual(85);

      const dervio = (spotsResults["dervio"] as any).data;
      expect(["CHOP", "BUMP_AND_JUMP"]).toContain(dervio.current.waterState);
      expect(dervio.current.lakeStateSource).toBe("LAKE_WIND_DERIVED");
    });
  });

  describe("Scenario 4: Dervio Strong North & Föhn", () => {
    it("scores Dervio highly under strong synoptic North (26 kt N / 360°) using regime-specific quality curve", () => {
      const { rec, spotsResults } = runScenario(26, 360, "2026-08-12T12:00:00.000Z", 0);

      expect(rec.regime).toBe("COMO_STRONG_NORTH");
      expect(rec.bestSpot).toBe("dervio");
      expect(rec.score).toBeGreaterThanOrEqual(80);

      const dervio = (spotsResults["dervio"] as any).data;
      expect(dervio.current.seaState.waveHeight).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("Scenario 5: Convective Hazard Safety Gate", () => {
    it("triggers regional safety hard gate making spots unsuitable under moderate wind (18 kt) in convective regime", () => {
      const { spotsResults } = runScenario(18, 180, "2026-08-12T14:00:00.000Z", 0, "COMO_CONVECTIVE_HAZARD");

      for (const spotId of Object.keys(spotsResults)) {
        const data = (spotsResults[spotId] as any).data;
        // Even at moderate 18 kt (well below 42 kt limit), convective hard gate forces UNSUITABLE
        expect(data.current.eligibility).toBe("UNSUITABLE");
      }
    });
  });

  describe("Scenario 6: Valmadrera Early-Morning Operating Window", () => {
    it("includes 05:30 local time in Valmadrera operating window and preserves it in forecast.spot", () => {
      const valmadrera = ComoLakeRegion.spots.find((s) => s.id === "valmadrera-pare")!;
      // 05:30 CEST on August 12 (03:30 UTC)
      const earlyMorningDate = new Date("2026-08-12T03:30:00.000Z");

      const isOperating = isSpotOperatingHour(earlyMorningDate, valmadrera, "Europe/Rome");
      expect(isOperating).toBe(true);

      const { spotsResults } = runScenario(12, 35, "2026-08-12T05:00:00.000Z", 0);
      const forecast = (spotsResults["valmadrera-pare"] as any).data;
      expect(forecast.spot.operatingWindow).toBeDefined();
      expect(forecast.spot.operatingWindow.mode).toBe("SOLAR_WITH_TWILIGHT");
      expect(forecast.spot.operatingWindow.earliestLocalTime).toBe("05:15");
    });
  });
});

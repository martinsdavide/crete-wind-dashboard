import { describe, it, expect } from "vitest";
import { GardaLakeRegion } from "@/regions/garda-lake";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import {
  RecommendationEngine,
  classifyRegionalRegimeForHour,
} from "@/engine/recommendation/RecommendationEngine";
import { OpenMeteoRawResponse } from "@/lib/weather/openMeteo";
import { SpotResult } from "@/types/weather";
import { isSpotOperatingHour } from "@/lib/solar";

describe("Garda Lake Edition — Plugin & Scenario Validations", () => {
  it("defines exactly 9 calibrated spots in the region", () => {
    expect(GardaLakeRegion.spots.length).toBe(9);
    const spotIds = GardaLakeRegion.spots.map((s) => s.id);
    expect(spotIds).toEqual([
      "pra-de-la-fam",
      "malcesine-navene",
      "torbole",
      "riva-del-garda",
      "campione-garda",
      "limone",
      "gargnano",
      "brenzone",
      "torri-del-benaco",
    ]);
  });

  it("all spots have configured Lake Profiles and hard gates", () => {
    for (const spot of GardaLakeRegion.spots) {
      expect(spot.lakeProfile).toBeDefined();
      expect(spot.lakeProfile?.fetchByDirectionKm).toBeDefined();
      expect(spot.hardGates).toBeDefined();
    }
  });

  const createSyntheticWeather = (
    windSpeed: number,
    windDirection: number,
    referenceHour = "2026-08-12T06:00:00.000Z",
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
      temperature_2m.push(24);
      cloud_cover.push(10);
      precipitation.push(0);
    }

    return {
      latitude: 45.7,
      longitude: 10.68,
      generationtime_ms: 10,
      utc_offset_seconds: 7200,
      timezone: "Europe/Rome",
      timezone_abbreviation: "CEST",
      elevation: 65,
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
    referenceHour = "2026-08-12T06:00:00.000Z",
    overrideRegime?: string
  ) => {
    const rawWeather = createSyntheticWeather(windSpeed, windDirection, referenceHour);
    const refDate = new Date(referenceHour);
    const count = rawWeather.hourly.time.length;

    // Compute hourly regimes pre-normalization
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

        const { regimeId } = classifyRegionalRegimeForHour(GardaLakeRegion, {
          meanRawWind: rawWeather.hourly.wind_speed_10m[i],
          meanDirectionDegrees: rawWeather.hourly.wind_direction_10m[i],
          precipitation12hMm: 0,
          currentPrecipitationMm: 0,
          localHour: localH,
        });
        hourlyRegimes.push(regimeId);
      }
    }

    const spotsResults: Record<string, SpotResult> = {};

    for (const spot of GardaLakeRegion.spots) {
      const forecast = normalizeSpotForecastGeneric(
        spot,
        rawWeather,
        refDate,
        GardaLakeRegion.timezone,
        hourlyRegimes,
        null // Lake Garda uses inland lake state estimator
      );
      spotsResults[spot.id] = { status: "ok", data: forecast };
    }

    const rec = RecommendationEngine.run(GardaLakeRegion, spotsResults, refDate);
    return { rec, spotsResults };
  };

  describe("Scenario 1: Prà de la Fam Pelèr Morning Thermal", () => {
    it("detects Pelèr and boosts Prà de la Fam during morning N flow (08:00 local CEST = 06:00 UTC)", () => {
      const { rec, spotsResults } = runScenario(13, 10, "2026-08-12T06:00:00.000Z");

      expect(rec.regime).toBe("GARDA_PELER");
      expect(rec.bestSpot).toBe("pra-de-la-fam");
      expect(rec.score).toBeGreaterThanOrEqual(80);

      const pra = (spotsResults["pra-de-la-fam"] as any).data;
      expect(pra.current.localWind).toBeGreaterThan(16);
      expect(pra.current.lakeStateSource).toBe("LAKE_WIND_DERIVED");
    });

    it("triggers Prà de la Fam shadow hard gate when morning flow is from the south", () => {
      const { spotsResults } = runScenario(10, 180, "2026-08-12T06:00:00.000Z");
      const pra = (spotsResults["pra-de-la-fam"] as any).data;
      expect(pra.current.eligibility).toBe("UNSUITABLE");
    });
  });

  describe("Scenario 2: Malcesine–Navene Early-Morning Pelèr Timing", () => {
    it("rewards Malcesine at early dawn (06:30 local CEST = 04:30 UTC)", () => {
      const { rec, spotsResults } = runScenario(12, 15, "2026-08-12T04:30:00.000Z");

      expect(rec.regime).toBe("GARDA_PELER");
      expect(["malcesine-navene", "pra-de-la-fam"]).toContain(rec.bestSpot);

      const malcesine = (spotsResults["malcesine-navene"] as any).data;
      expect(malcesine.current.localWind).toBeGreaterThan(14);
    });
  });

  describe("Scenario 3: Torbole & Riva Afternoon Ora Thermal", () => {
    it("detects Ora in the afternoon under southerly flow (15:00 local CEST = 13:00 UTC)", () => {
      const { rec, spotsResults } = runScenario(12, 190, "2026-08-12T13:00:00.000Z");

      expect(rec.regime).toBe("GARDA_ORA");
      expect(rec.bestSpot).toBe("torbole");
      expect(rec.score).toBeGreaterThanOrEqual(80);

      const torbole = (spotsResults["torbole"] as any).data;
      expect(torbole.current.localWind).toBeGreaterThan(16);
      expect(["CHOP", "BUMP_AND_JUMP"]).toContain(torbole.current.waterState);
    });
  });

  describe("Scenario 4: Pelèr–Ora Midday Transition", () => {
    it("detects transition during late morning lull (12:00 local CEST = 10:00 UTC, 6 kt)", () => {
      const { rec } = runScenario(6, 90, "2026-08-12T10:00:00.000Z");

      expect(rec.regime).toBe("GARDA_TRANSITION");
    });
  });

  describe("Scenario 5: Strong Synoptic North vs Pelèr", () => {
    it("distinguishes strong midday northerly gradient (26 kt N at 13:00 CEST) from thermal Pelèr", () => {
      const { rec, spotsResults } = runScenario(26, 360, "2026-08-12T11:00:00.000Z");

      expect(rec.regime).toBe("GARDA_STRONG_NORTH");
      const pra = (spotsResults["pra-de-la-fam"] as any).data;
      expect(pra.current.seaState.waveHeight).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("Scenario 6: Convective Hazard Safety Gate", () => {
    it("triggers regional safety hard gate making all spots unsuitable under convective hazard", () => {
      const { spotsResults } = runScenario(18, 180, "2026-08-12T14:00:00.000Z", "GARDA_CONVECTIVE_HAZARD");

      for (const spotId of Object.keys(spotsResults)) {
        const data = (spotsResults[spotId] as any).data;
        expect(data.current.eligibility).toBe("UNSUITABLE");
      }
    });
  });

  describe("Scenario 7: Spot-Specific Operating Windows", () => {
    it("validates Malcesine early dawn window (04:30 local time)", () => {
      const malcesine = GardaLakeRegion.spots.find((s) => s.id === "malcesine-navene")!;
      const dawnDate = new Date("2026-08-12T02:30:00.000Z"); // 04:30 CEST

      const isOperating = isSpotOperatingHour(dawnDate, malcesine, "Europe/Rome");
      expect(isOperating).toBe(true);
    });

    it("preserves operatingWindow in normalized forecast spot object", () => {
      const { spotsResults } = runScenario(13, 10, "2026-08-12T06:00:00.000Z");
      const praForecast = (spotsResults["pra-de-la-fam"] as any).data;

      expect(praForecast.spot.operatingWindow).toBeDefined();
      expect(praForecast.spot.operatingWindow.mode).toBe("SOLAR_WITH_TWILIGHT");
      expect(praForecast.spot.operatingWindow.earliestLocalTime).toBe("05:00");
    });
  });
});

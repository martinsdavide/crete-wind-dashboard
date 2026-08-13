import { NextRequest, NextResponse } from "next/server";
import { getRegion } from "@/regions/registry";
import { fetchSpotWeather } from "@/lib/weather/openMeteo";
import { defaultMarineProvider } from "@/lib/marine/openMeteoMarine";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import {
  RecommendationEngine,
  classifyRegionalRegimeForHour,
} from "@/engine/recommendation/RecommendationEngine";
import { SpotForecast, SpotResult, WindApiResponse } from "@/types/weather";
import { ObservationLogger } from "@/engine/observations/ObservationLogger";

export const revalidate = 900; // 15 minutes cache

export async function GET(request: NextRequest) {
  const requestId = "req_" + Math.random().toString(36).substring(2, 11);
  const currentTime = new Date();
  const searchParams = request.nextUrl.searchParams;
  const regionId = searchParams.get("region");

  const regionConfig = getRegion(regionId);

  // Fetch atmospheric and marine forecasts for all spots in parallel with fault tolerance
  const fetchPromises = regionConfig.spots.map(async (spot) => {
    const isLake = !!spot.lakeProfile || regionConfig.id === "como-lake" || regionConfig.id === "garda-lake";
    const [weatherRes, marineRes] = await Promise.allSettled([
      fetchSpotWeather(spot.latitude, spot.longitude, 4),
      isLake ? Promise.resolve(null) : defaultMarineProvider.fetchMarineForecast(spot.latitude, spot.longitude, 4),
    ]);

    return {
      weather: weatherRes.status === "fulfilled" ? weatherRes.value : null,
      marine: marineRes.status === "fulfilled" ? marineRes.value : null,
      weatherError: weatherRes.status === "rejected" ? weatherRes.reason : null,
    };
  });

  const settledResults = await Promise.all(fetchPromises);

  // Pre-calculate regional hourly regimes across all hourly timesteps
  const availableWeather = settledResults
    .map((r) => r.weather)
    .filter((w): w is NonNullable<typeof w> => w !== null && !!w.hourly);

  const hoursCount = availableWeather[0]?.hourly.time.length ?? 0;
  const hourlyRegimes: string[] = [];

  for (let i = 0; i < hoursCount; i++) {
    const rawWinds: number[] = [];
    const rawDirs: number[] = [];
    const rawGusts: number[] = [];
    const precip12hs: number[] = [];
    const currPrecips: number[] = [];

    for (const w of availableWeather) {
      const spd = w.hourly.wind_speed_10m[i];
      const dir = w.hourly.wind_direction_10m[i];
      const gst = w.hourly.wind_gusts_10m ? w.hourly.wind_gusts_10m[i] : undefined;
      if (spd !== undefined) rawWinds.push(spd);
      if (dir !== undefined) rawDirs.push(dir);
      if (gst !== undefined) rawGusts.push(gst);

      if (w.hourly.precipitation) {
        const start12 = Math.max(0, i - 11);
        let sum12 = 0;
        for (let p = start12; p <= i; p++) {
          sum12 += w.hourly.precipitation[p] ?? 0;
        }
        precip12hs.push(sum12);
        currPrecips.push(w.hourly.precipitation[i] ?? 0);
      }
    }

    const meanRawWind =
      rawWinds.length > 0
        ? rawWinds.reduce((a, b) => a + b, 0) / rawWinds.length
        : 12;

    const meanGust =
      rawGusts.length > 0
        ? rawGusts.reduce((a, b) => a + b, 0) / rawGusts.length
        : meanRawWind;

    const gustFactor = meanRawWind > 0 ? meanGust / meanRawWind : 1.0;

    let sinSum = 0;
    let cosSum = 0;
    for (const d of rawDirs) {
      const rad = (d * Math.PI) / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    const meanDirDeg = (Math.atan2(sinSum, cosSum) * (180 / Math.PI) + 360) % 360;

    const mean12hPrecip =
      precip12hs.length > 0
        ? precip12hs.reduce((a, b) => a + b, 0) / precip12hs.length
        : 0;

    const meanCurrPrecip =
      currPrecips.length > 0
        ? currPrecips.reduce((a, b) => a + b, 0) / currPrecips.length
        : 0;

    const hourTimeStr = availableWeather[0].hourly.time[i];
    let localHour = 12;
    try {
      const hStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: regionConfig.timezone || "Europe/Athens",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(hourTimeStr));
      localHour = parseInt(hStr, 10);
    } catch {}

    const { regimeId } = classifyRegionalRegimeForHour(regionConfig, {
      meanRawWind,
      meanDirectionDegrees: meanDirDeg,
      precipitation12hMm: mean12hPrecip,
      currentPrecipitationMm: meanCurrPrecip,
      localHour,
      gustFactor,
    });

    hourlyRegimes.push(regimeId);
  }

  // Fetch live weather observations for region if configured
  const regionBindings =
    regionConfig.id === "como-lake"
      ? (await import("@/engine/observations/bindings/comoLakeBindings")).COMO_LAKE_STATION_BINDINGS
      : regionConfig.id === "garda-lake"
      ? (await import("@/engine/observations/bindings/gardaLakeBindings")).GARDA_LAKE_STATION_BINDINGS
      : regionConfig.id === "maremma"
      ? (await import("@/engine/observations/bindings/maremmaBindings")).MAREMMA_STATION_BINDINGS
      : null;

  let observations: Record<string, any> = {};
  if (regionBindings) {
    const allStationIds = Array.from(
      new Set(Object.values(regionBindings).flatMap((bList) => bList.map((b) => b.stationId)))
    );
    try {
      const { ObservationRepository } = await import("@/engine/observations/ObservationRepository");
      observations = await ObservationRepository.getObservationsForStations(allStationIds, currentTime, requestId);
    } catch (e) {
      console.warn("Observation fetch skipped:", e);
    }
  }

  const spotsResults: Record<string, SpotResult> = {};
  const models: Record<string, string> = {};
  let anyFulfilled = false;

  regionConfig.spots.forEach((spot, idx) => {
    const { weather, marine, weatherError } = settledResults[idx];

    if (weather) {
      anyFulfilled = true;
      const forecast: SpotForecast = normalizeSpotForecastGeneric(
        spot,
        weather,
        currentTime,
        regionConfig.timezone,
        hourlyRegimes,
        marine
      );

      // Apply Live Observation Fusion if station bindings exist
      if (regionBindings && regionBindings[spot.id]) {
        try {
          const { ObservationFusionEngine } = require("@/engine/observations/ObservationFusionEngine");
          const fusion = ObservationFusionEngine.fuseSpotForecast(
            spot.id,
            regionBindings[spot.id],
            observations,
            forecast.current.localWind,
            forecast.current.localGust,
            forecast.current.directionDegrees,
            currentTime,
            0,
            regionConfig.id,
            requestId
          );
          forecast.observationFusion = fusion;
          if (fusion.status === "available" || fusion.status === "partial") {
            const adjustedHourly = {
              ...forecast.current,
              localWind: fusion.correctedWindSpeedKt,
              localGust: fusion.correctedWindGustKt,
              directionDegrees: fusion.correctedWindDirectionDeg ?? forecast.current.directionDegrees,
              confidence: Math.min(
                100,
                Math.max(0, Math.round(forecast.current.confidence + fusion.confidenceAdjustment * 100))
              ),
            };
            forecast.adjustedForecast = adjustedHourly;
            // Update forecast.current directly so recommendation engine and spot cards evaluate the fused conditions
            forecast.current = adjustedHourly;
          }
        } catch (e) {
          console.warn(`Observation fusion error on ${spot.id}:`, e);
        }
      }

      spotsResults[spot.id] = { status: "ok", data: forecast };
      models[spot.id] = forecast.providerModel || "ECMWF IFS HRES (via Open-Meteo)";
    } else {
      console.error(`Forecast fetch failed for spot ${spot.id} (${spot.name}):`, weatherError);
      spotsResults[spot.id] = {
        status: "error",
        message:
          weatherError instanceof Error
            ? weatherError.message
            : "Weather data unavailable",
        spot: {
          id: spot.id,
          name: spot.name,
          subtitle: spot.description,
          latitude: spot.latitude,
          longitude: spot.longitude,
          localCorrectionEnabled: true,
        },
      };
      models[spot.id] = "Unavailable";
    }
  });

  // If all spots in the region failed, return 503
  if (!anyFulfilled) {
    return NextResponse.json(
      {
        error: "Forecast temporarily unavailable",
        message: `Unable to retrieve weather data for ${regionConfig.metadata.displayName}`,
        generatedAt: currentTime.toISOString(),
      },
      { status: 503 }
    );
  }

  // Run decoupled Recommendation Engine for Today and Tomorrow
  const recommendation = RecommendationEngine.run(regionConfig, spotsResults, currentTime);
  const tomorrowTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowRecommendation = RecommendationEngine.run(regionConfig, spotsResults, tomorrowTime);

  const defaultModel =
    Object.values(models).find((m) => m !== "Unavailable") ||
    "ECMWF IFS HRES (via Open-Meteo)";

  const spotList = regionConfig.spots.map((s) => spotsResults[s.id]);

  // Log structured Vercel events for engine consumption
  regionConfig.spots.forEach((spot) => {
    const res = spotsResults[spot.id];
    if (res && res.status === "ok") {
      const isFused =
        !!res.data.observationFusion &&
        (res.data.observationFusion.status === "available" || res.data.observationFusion.status === "partial");
      ObservationLogger.logRecommendation(
        regionConfig.id,
        spot.id,
        isFused ? "observation-adjusted" : "forecast-only",
        res.data.current.localWind,
        res.data.observationFusion?.status || "unavailable",
        requestId
      );
    }
  });

  const response: WindApiResponse = {
    generatedAt: currentTime.toISOString(),
    regionId: regionConfig.id,
    regionMetadata: regionConfig.metadata,
    model: defaultModel,
    models,
    timezone: regionConfig.timezone,
    spots: spotsResults,
    spotList,
    recommendation,
    tomorrowRecommendation,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}

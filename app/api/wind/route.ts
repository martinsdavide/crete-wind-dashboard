import { NextRequest, NextResponse } from "next/server";
import { getRegion } from "@/regions/registry";
import { fetchSpotWeather } from "@/lib/weather/openMeteo";
import { normalizeSpotForecastGeneric } from "@/engine/forecast/ForecastNormalizer";
import { RecommendationEngine } from "@/engine/recommendation/RecommendationEngine";
import { SpotForecast, SpotResult, WindApiResponse } from "@/types/weather";

export const revalidate = 900; // 15 minutes cache

export async function GET(request: NextRequest) {
  const currentTime = new Date();
  const searchParams = request.nextUrl.searchParams;
  const regionId = searchParams.get("region");

  const regionConfig = getRegion(regionId);

  // Fetch all spots in the selected region in parallel with fault tolerance
  const fetchPromises = regionConfig.spots.map((spot) =>
    fetchSpotWeather(spot.latitude, spot.longitude, 4)
  );

  const settledResults = await Promise.allSettled(fetchPromises);

  const spotsResults: Record<string, SpotResult> = {};
  const models: Record<string, string> = {};
  let anyFulfilled = false;

  regionConfig.spots.forEach((spot, idx) => {
    const settled = settledResults[idx];

    if (settled.status === "fulfilled") {
      anyFulfilled = true;
      const forecast: SpotForecast = normalizeSpotForecastGeneric(
        spot,
        settled.value,
        currentTime,
        regionConfig.timezone
      );
      spotsResults[spot.id] = { status: "ok", data: forecast };
      models[spot.id] = forecast.providerModel || "ECMWF IFS HRES (via Open-Meteo)";
    } else {
      console.error(`Forecast fetch failed for spot ${spot.id} (${spot.name}):`, settled.reason);
      spotsResults[spot.id] = {
        status: "error",
        message:
          settled.reason instanceof Error
            ? settled.reason.message
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

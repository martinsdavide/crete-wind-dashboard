import { NextResponse } from "next/server";
import { SPOTS } from "@/config/spots";
import { fetchSpotWeather } from "@/lib/weather/openMeteo";
import { normalizeSpotForecast } from "@/lib/weather/normalizeForecast";
import { calculateBestSpotRecommendation } from "@/lib/dailySummary";
import { SpotForecast, SpotResult, WindApiResponse } from "@/types/weather";

export const revalidate = 900; // 15 minutes cache

export async function GET() {
  const currentTime = new Date();

  // Fetch both spots in parallel with independent failure tolerance (Promise.allSettled)
  const results = await Promise.allSettled([
    fetchSpotWeather(SPOTS.kouremenos.latitude, SPOTS.kouremenos.longitude, 4),
    fetchSpotWeather(SPOTS.tenda.latitude, SPOTS.tenda.longitude, 4),
  ]);

  const [kouremenosSettled, tendaSettled] = results;

  let kouremenosForecast: SpotForecast | null = null;
  let tendaForecast: SpotForecast | null = null;

  let kouremenosResult: SpotResult;
  let tendaResult: SpotResult;

  if (kouremenosSettled.status === "fulfilled") {
    kouremenosForecast = normalizeSpotForecast(
      SPOTS.kouremenos,
      kouremenosSettled.value,
      currentTime
    );
    kouremenosResult = { status: "ok", data: kouremenosForecast };
  } else {
    console.error("Kouremenos forecast fetch failed:", kouremenosSettled.reason);
    kouremenosResult = {
      status: "error",
      message:
        kouremenosSettled.reason instanceof Error
          ? kouremenosSettled.reason.message
          : "Weather data unavailable",
      spot: SPOTS.kouremenos,
    };
  }

  if (tendaSettled.status === "fulfilled") {
    tendaForecast = normalizeSpotForecast(
      SPOTS.tenda,
      tendaSettled.value,
      currentTime
    );
    tendaResult = { status: "ok", data: tendaForecast };
  } else {
    console.error("Tenda forecast fetch failed:", tendaSettled.reason);
    tendaResult = {
      status: "error",
      message:
        tendaSettled.reason instanceof Error
          ? tendaSettled.reason.message
          : "Weather data unavailable",
      spot: SPOTS.tenda,
    };
  }

  // If both spots completely failed, return 503
  if (!kouremenosForecast && !tendaForecast) {
    return NextResponse.json(
      {
        error: "Forecast temporarily unavailable",
        message: "Unable to retrieve weather data for all spots",
        generatedAt: currentTime.toISOString(),
      },
      { status: 503 }
    );
  }

  const recommendation = calculateBestSpotRecommendation(
    kouremenosForecast,
    tendaForecast,
    currentTime
  );

  const activeModel =
    kouremenosForecast?.providerModel ||
    tendaForecast?.providerModel ||
    "ECMWF IFS HRES (via Open-Meteo)";

  const response: WindApiResponse = {
    generatedAt: currentTime.toISOString(),
    model: activeModel,
    timezone: "Europe/Athens",
    spots: {
      kouremenos: kouremenosResult,
      tenda: tendaResult,
    },
    recommendation,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
    },
  });
}

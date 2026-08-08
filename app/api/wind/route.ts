import { NextResponse } from "next/server";
import { SPOTS } from "@/config/spots";
import { fetchSpotWeather } from "@/lib/weather/openMeteo";
import { normalizeSpotForecast } from "@/lib/weather/normalizeForecast";
import { calculateBestSpotRecommendation } from "@/lib/dailySummary";
import { WindApiResponse } from "@/types/weather";

export const revalidate = 900; // 15 minutes cache

export async function GET() {
  const currentTime = new Date();

  try {
    // Fetch both spots in parallel
    const [kouremenosRaw, tendaRaw] = await Promise.all([
      fetchSpotWeather(SPOTS.kouremenos.latitude, SPOTS.kouremenos.longitude, 4),
      fetchSpotWeather(SPOTS.tenda.latitude, SPOTS.tenda.longitude, 4),
    ]);

    const kouremenosForecast = normalizeSpotForecast(
      SPOTS.kouremenos,
      kouremenosRaw,
      currentTime
    );

    const tendaForecast = normalizeSpotForecast(
      SPOTS.tenda,
      tendaRaw,
      currentTime
    );

    const recommendation = calculateBestSpotRecommendation(
      kouremenosForecast,
      tendaForecast
    );

    const response: WindApiResponse = {
      generatedAt: currentTime.toISOString(),
      model: "ECMWF IFS via Open-Meteo",
      timezone: "Europe/Athens",
      spots: {
        kouremenos: kouremenosForecast,
        tenda: tendaForecast,
      },
      recommendation,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
      },
    });
  } catch (error: unknown) {
    console.error("API /api/wind Error:", error);
    return NextResponse.json(
      {
        error: "Forecast temporarily unavailable",
        message: error instanceof Error ? error.message : "Failed to fetch weather data",
        generatedAt: currentTime.toISOString(),
      },
      { status: 503 }
    );
  }
}

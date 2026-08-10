"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { WindApiResponse, SpotResult } from "@/types/weather";
import { SpotId } from "@/types/spot";
import { Header } from "@/components/Header";
import { BestSpot } from "@/components/BestSpot";
import { SpotCard } from "@/components/SpotCard";
import { HourlyForecast } from "@/components/HourlyForecast";
import { DailyForecast } from "@/components/DailyForecast";
import { WindChart } from "@/components/WindChart";
import { ForecastInfo } from "@/components/ForecastInfo";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function HomePage() {
  const [data, setData] = useState<WindApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/wind", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const payload: WindApiResponse = await res.json();
      setData(payload);
    } catch (err: unknown) {
      console.error("Failed to load wind forecast:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Forecast temporarily unavailable. Please check your network connection."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchForecast();

    const interval = setInterval(() => {
      fetchForecast();
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchForecast]);

  // Dynamically order Spot Cards by surf quality score, falling back to default order if no spot is surfable
  const orderedSpots = useMemo<SpotResult[]>(() => {
    if (!data) return [];

    const defaultOrder: SpotId[] = ["kouremenos", "tenda", "xerokampos"];

    const spotsList: {
      id: SpotId;
      result: SpotResult;
      score: number;
      isSurfable: boolean;
    }[] = [
      {
        id: "kouremenos",
        result: data.spots.kouremenos,
        score:
          data.recommendation?.dayScoreKouremenos ??
          (data.spots.kouremenos.status === "ok"
            ? data.spots.kouremenos.data.days[0]?.score ?? 0
            : 0),
        isSurfable:
          data.spots.kouremenos.status === "ok" &&
          data.spots.kouremenos.data.current.eligibility !== "UNSUITABLE" &&
          (data.recommendation?.dayScoreKouremenos ??
            data.spots.kouremenos.data.days[0]?.score ??
            0) >= 60,
      },
      {
        id: "tenda",
        result: data.spots.tenda,
        score:
          data.recommendation?.dayScoreTenda ??
          (data.spots.tenda.status === "ok"
            ? data.spots.tenda.data.days[0]?.score ?? 0
            : 0),
        isSurfable:
          data.spots.tenda.status === "ok" &&
          data.spots.tenda.data.current.eligibility !== "UNSUITABLE" &&
          (data.recommendation?.dayScoreTenda ??
            data.spots.tenda.data.days[0]?.score ??
            0) >= 60,
      },
      {
        id: "xerokampos",
        result: data.spots.xerokampos,
        score:
          data.recommendation?.dayScoreXerokampos ??
          (data.spots.xerokampos.status === "ok"
            ? data.spots.xerokampos.data.days[0]?.score ?? 0
            : 0),
        isSurfable:
          data.spots.xerokampos.status === "ok" &&
          data.spots.xerokampos.data.current.eligibility !== "UNSUITABLE" &&
          (data.recommendation?.dayScoreXerokampos ??
            data.spots.xerokampos.data.days[0]?.score ??
            0) >= 60,
      },
    ];

    // Check if at least one spot is surfable (or has an active Best Spot recommendation)
    const anySurfable = spotsList.some(
      (s) =>
        s.isSurfable ||
        (data.recommendation?.bestSpot === s.id && (data.recommendation?.score ?? 0) > 0)
    );

    // If no spot is surfable, keep default sequence: Kouremenos, Tenda, Xerokampos
    if (!anySurfable) {
      return spotsList.map((s) => s.result);
    }

    // Sort dynamically in descending order of surf quality score
    return [...spotsList]
      .sort((a, b) => {
        // The recommended bestSpot always leads
        if (data.recommendation?.bestSpot === a.id) return -1;
        if (data.recommendation?.bestSpot === b.id) return 1;

        if (b.score !== a.score) {
          return b.score - a.score;
        }

        // Tie-breaker: default order
        return defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id);
      })
      .map((s) => s.result);
  }, [data]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        onRefresh={() => fetchForecast(true)}
        isRefreshing={refreshing}
        generatedAt={data?.generatedAt}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-3 text-rose-300">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block text-sm font-bold text-rose-200">
                  Forecast temporarily unavailable
                </strong>
                <p className="text-xs text-rose-300/90">{error}</p>
              </div>
            </div>
            <button
              onClick={() => fetchForecast(true)}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-semibold text-white flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !data && <LoadingSkeleton />}

        {/* Loaded Forecast Content */}
        {data && (
          <>
            {/* 1. Best Today Session Hero Card */}
            <BestSpot
              recommendation={data.recommendation}
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
              xerokamposResult={data.spots.xerokampos}
            />

            {/* 2. 3 Spot Cards (Ordered dynamically by surf quality) */}
            <section aria-labelledby="spots-heading" className="space-y-2">
              <h2 id="spots-heading" className="sr-only">
                Current Spot Conditions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {orderedSpots.map((spotRes) => (
                  <SpotCard
                    key={spotRes.status === "ok" ? spotRes.data.spot.id : spotRes.spot.id}
                    result={spotRes}
                  />
                ))}
              </div>
            </section>

            {/* 3. Hourly Forecast Ribbon (Defaults dynamically to Best Spot) */}
            <HourlyForecast
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
              xerokamposResult={data.spots.xerokampos}
              defaultSpotId={data.recommendation?.bestSpot || "kouremenos"}
            />

            {/* 4. 4-Day Forecast Overview (Defaults dynamically to Best Spot) */}
            <DailyForecast
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
              xerokamposResult={data.spots.xerokampos}
              defaultSpotId={data.recommendation?.bestSpot || "kouremenos"}
            />

            {/* 5. 3-Spot Wind Comparison Chart */}
            <WindChart
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
              xerokamposResult={data.spots.xerokampos}
            />

            {/* 6. Forecast Source Information & Disclaimer */}
            <ForecastInfo
              generatedAt={data.generatedAt}
              model={data.model}
            />
          </>
        )}
      </main>
    </div>
  );
}

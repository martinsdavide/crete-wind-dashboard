"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { WindApiResponse, SpotResult } from "@/types/weather";
import { useRegion } from "@/context/RegionContext";
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
  const { currentRegion } = useRegion();
  const [data, setData] = useState<WindApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetch(`/api/wind?region=${encodeURIComponent(currentRegion.id)}`, {
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
    },
    [currentRegion.id]
  );

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

    const spotEntries: { id: string; result: SpotResult; score: number; isSurfable: boolean }[] = [];

    const spotList =
      data.spotList && data.spotList.length > 0
        ? data.spotList
        : Object.values(data.spots);

    for (const res of spotList) {
      if (!res) continue;
      const spotId = res.status === "ok" ? res.data.spot.id : res.spot.id;
      const score = res.status === "ok" ? res.data.days[0]?.score ?? 0 : 0;
      const isSurfable =
        res.status === "ok" &&
        res.data.current.eligibility !== "UNSUITABLE" &&
        score >= 60;

      spotEntries.push({
        id: spotId,
        result: res,
        score,
        isSurfable,
      });
    }

    const anySurfable = spotEntries.some(
      (s) =>
        s.isSurfable ||
        (data.recommendation?.bestSpot === s.id && (data.recommendation?.score ?? 0) > 0)
    );

    // If no spot is surfable, keep default configured order
    if (!anySurfable) {
      return spotEntries.map((s) => s.result);
    }

    // Sort dynamically in descending order of surf quality score
    return [...spotEntries]
      .sort((a, b) => {
        // The recommended bestSpot always leads
        if (data.recommendation?.bestSpot === a.id) return -1;
        if (data.recommendation?.bestSpot === b.id) return 1;

        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return 0;
      })
      .map((s) => s.result);
  }, [data]);

  // Extract individual spot results safely for sub-components
  const kouremenosRes = data?.spots.kouremenos || (data?.spotList && data.spotList[0])!;
  const tendaRes = data?.spots.tenda || (data?.spotList && data.spotList[1])!;
  const xerokamposRes = data?.spots.xerokampos || (data?.spotList && data.spotList[2])!;

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
              spots={data.spots}
              spotList={orderedSpots}
              timezone={data.timezone}
            />

            {/* 2. Spot Cards (Ordered dynamically by surf quality) */}
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
              kouremenosResult={kouremenosRes}
              tendaResult={tendaRes}
              xerokamposResult={xerokamposRes}
              defaultSpotId={data.recommendation?.bestSpot || currentRegion.defaultSpotId}
            />

            {/* 4. 4-Day Forecast Overview (Defaults dynamically to Best Spot) */}
            <DailyForecast
              kouremenosResult={kouremenosRes}
              tendaResult={tendaRes}
              xerokamposResult={xerokamposRes}
              defaultSpotId={data.recommendation?.bestSpot || currentRegion.defaultSpotId}
            />

            {/* 5. 3-Spot Wind Comparison Chart */}
            <WindChart
              kouremenosResult={kouremenosRes}
              tendaResult={tendaRes}
              xerokamposResult={xerokamposRes}
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

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { WindApiResponse } from "@/types/weather";
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

  // Initial load & 15-min auto-refresh
  useEffect(() => {
    fetchForecast();

    const interval = setInterval(() => {
      fetchForecast();
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchForecast]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        onRefresh={() => fetchForecast(true)}
        isRefreshing={refreshing}
        generatedAt={data?.generatedAt}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 space-y-6">
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
            {/* 1. Best Today Hero Card */}
            <BestSpot
              recommendation={data.recommendation}
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
            />

            {/* 2. Spot Cards (Stacked on Mobile, Side-by-Side on Desktop) */}
            <section aria-labelledby="spots-heading" className="space-y-2">
              <h2 id="spots-heading" className="sr-only">
                Current Spot Conditions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SpotCard result={data.spots.kouremenos} />
                <SpotCard result={data.spots.tenda} />
              </div>
            </section>

            {/* 3. Hourly Forecast Ribbon */}
            <HourlyForecast
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
            />

            {/* 4. 4-Day Forecast Overview */}
            <DailyForecast
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
            />

            {/* 5. Wind Chart Evolution & Comparison */}
            <WindChart
              kouremenosResult={data.spots.kouremenos}
              tendaResult={data.spots.tenda}
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

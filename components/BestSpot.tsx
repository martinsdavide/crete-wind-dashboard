"use client";

import React from "react";
import { Recommendation, SpotForecast } from "@/types/weather";
import { Compass, Clock, Award, Flame, Wind } from "lucide-react";

interface BestSpotProps {
  recommendation: Recommendation;
  kouremenosForecast: SpotForecast;
  tendaForecast: SpotForecast;
}

export const BestSpot: React.FC<BestSpotProps> = ({
  recommendation,
  kouremenosForecast,
  tendaForecast,
}) => {
  const { bestSpot, bestSpotName, bestWindow, score, dayScoreKouremenos, dayScoreTenda } =
    recommendation;

  const chosenForecast =
    bestSpot === "kouremenos" ? kouremenosForecast : tendaForecast;

  const todaySummary = chosenForecast.days[0];

  // Condition color scheme
  const conditionGradients: Record<string, string> = {
    EXCELLENT: "from-cyan-500/20 via-sky-500/10 to-transparent border-cyan-500/40 text-cyan-300",
    "VERY GOOD": "from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500/40 text-emerald-300",
    GOOD: "from-green-500/20 via-emerald-500/10 to-transparent border-green-500/40 text-green-300",
    OK: "from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/40 text-amber-300",
    POOR: "from-slate-500/20 via-slate-600/10 to-transparent border-slate-600 text-slate-300",
  };

  const currentCondition = todaySummary?.condition || "OK";
  const gradientClass =
    conditionGradients[currentCondition] || conditionGradients.OK;

  return (
    <section aria-labelledby="best-today-heading" className="w-full">
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-b ${gradientClass} border bg-surf-card/90 p-5 sm:p-6 shadow-xl backdrop-blur-md transition-all`}
      >
        {/* Glow accent */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-sky-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Award className="w-4 h-4" />
            </span>
            <h2
              id="best-today-heading"
              className="text-xs font-black tracking-wider uppercase text-sky-400"
            >
              BEST SPOT TODAY
            </h2>
          </div>

          {score !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surf-dark/60 border border-surf-border">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-mono font-bold text-white">
                Score {score}/100
              </span>
            </div>
          )}
        </div>

        {bestSpotName ? (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
                  {bestSpotName}
                </h3>
                <p className="text-xs text-slate-400">
                  {bestSpot === "kouremenos"
                    ? "Palekastro Bay • Thermal Boost Active"
                    : "Cape Sidero • Consistent Meltemi"}
                </p>
              </div>

              <div className="inline-flex items-center self-start px-3 py-1 rounded-lg bg-sky-400/10 border border-sky-400/30 text-sky-300 text-sm font-bold tracking-wide">
                {currentCondition}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surf-border/60">
              {/* Window Box */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surf-dark/50 border border-surf-border/40">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
                    BEST WINDOW
                  </span>
                  <span className="text-base font-extrabold font-mono text-white">
                    {bestWindow
                      ? `${bestWindow.start} – ${bestWindow.end}`
                      : "09:00 – 20:00 (Daytime Peak)"}
                  </span>
                </div>
              </div>

              {/* Wind & Direction Box */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surf-dark/50 border border-surf-border/40">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
                    EXPECTED WIND
                  </span>
                  <span className="text-base font-extrabold text-cyan-300 flex items-center gap-1.5">
                    <span>
                      {bestWindow
                        ? `${bestWindow.minWind}–${bestWindow.maxWind} kt`
                        : `${todaySummary?.minWind || 0}–${todaySummary?.maxWind || 0} kt`}
                    </span>
                    <span className="text-white font-mono text-sm px-1.5 py-0.5 rounded bg-surf-card border border-surf-border">
                      {bestWindow?.dominantDirection || todaySummary?.dominantDirection || "NW"}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Comparison Bar */}
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>
                Today comparison:{" "}
                <strong className="text-slate-200">Kouremenos ({dayScoreKouremenos})</strong> vs{" "}
                <strong className="text-slate-200">Tenda ({dayScoreTenda})</strong>
              </span>
              {todaySummary?.maxGust ? (
                <span className="flex items-center gap-1 text-slate-300">
                  <Wind className="w-3 h-3 text-slate-400" />
                  Peak Gust: <strong className="text-amber-400">{todaySummary.maxGust} kt</strong>
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-slate-400">
              Low wind conditions across both spots today.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

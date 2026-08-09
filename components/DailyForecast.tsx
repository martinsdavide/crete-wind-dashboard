"use client";

import React, { useState } from "react";
import { SpotResult } from "@/types/weather";
import { SpotId } from "@/types/spot";
import { WindArrow } from "./WindArrow";
import { Calendar, Clock, Wind, Flame, AlertTriangle, Waves } from "lucide-react";

interface DailyForecastProps {
  kouremenosResult: SpotResult;
  tendaResult: SpotResult;
  xerokamposResult: SpotResult;
}

export const DailyForecast: React.FC<DailyForecastProps> = ({
  kouremenosResult,
  tendaResult,
  xerokamposResult,
}) => {
  const [activeSpotId, setActiveSpotId] = useState<SpotId>("kouremenos");

  const activeResult =
    activeSpotId === "kouremenos"
      ? kouremenosResult
      : activeSpotId === "tenda"
      ? tendaResult
      : xerokamposResult;

  const activeForecast = activeResult?.status === "ok" ? activeResult.data : null;

  const formatDateLabel = (dateStr: string, index: number) => {
    if (index === 0) return "TODAY";
    if (index === 1) return "TOMORROW";

    try {
      const date = new Date(dateStr + "T12:00:00Z");
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Athens",
        weekday: "short",
        day: "numeric",
        month: "short",
      })
        .format(date)
        .toUpperCase();
    } catch {
      return dateStr;
    }
  };

  const conditionColors: Record<string, string> = {
    EXCELLENT: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
    "VERY GOOD": "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    GOOD: "text-green-300 bg-green-500/10 border-green-500/30",
    OK: "text-amber-300 bg-amber-500/10 border-amber-500/30",
    POOR: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  };

  return (
    <section aria-labelledby="daily-forecast-heading" className="w-full">
      <div className="rounded-2xl bg-surf-card border border-surf-border p-5 shadow-lg">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2
              id="daily-forecast-heading"
              className="text-base font-extrabold uppercase tracking-tight text-white flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>4-DAY FORECAST OVERVIEW</span>
            </h2>
            <p className="text-xs text-slate-400">
              Daytime peak windsurfing conditions (09:00 – 20:00) with session quality scores
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-surf-dark border border-surf-border self-start sm:self-auto">
            <button
              onClick={() => setActiveSpotId("kouremenos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSpotId === "kouremenos"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Kouremenos
            </button>
            <button
              onClick={() => setActiveSpotId("tenda")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSpotId === "tenda"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tenda
            </button>
            <button
              onClick={() => setActiveSpotId("xerokampos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSpotId === "xerokampos"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Xerokampos
            </button>
          </div>
        </div>

        {/* Unavailable State */}
        {activeResult?.status === "error" || !activeForecast ? (
          <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Daily forecast currently unavailable for this spot.</span>
          </div>
        ) : (
          /* 4 Days Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeForecast.days.slice(0, 4).map((day, index) => {
              const badgeClass = conditionColors[day.condition] || conditionColors.OK;
              const arrowRotation = (day.dominantDirectionDegrees + 180) % 360;

              return (
                <div
                  key={day.date}
                  className="flex flex-col justify-between p-4 rounded-xl bg-surf-dark/60 border border-surf-border/60 hover:border-surf-border transition-all"
                >
                  <div>
                    {/* Top Day Header */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-xs font-black tracking-wider text-slate-300">
                        {formatDateLabel(day.date, index)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}
                      >
                        {day.condition}
                      </span>
                    </div>

                    {/* Wind Speed (Daytime Focus) & Dominant Direction */}
                    <div className="flex items-center justify-between py-2 border-b border-surf-border/40">
                      <div>
                        <span className="text-2xl font-black font-mono text-white">
                          {day.daytimeMinWind}–{day.daytimeMaxWind}{" "}
                          <span className="text-xs font-normal text-sky-400">kt</span>
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          24h: {day.minWind}–{day.maxWind} kt
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold font-mono text-cyan-300">
                          {day.dominantDirection}
                        </span>
                        <WindArrow
                          rotation={arrowRotation}
                          directionLabel={day.dominantDirection}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Gust & Session Score */}
                    <div className="flex items-center justify-between text-xs py-2 text-slate-400">
                      <span className="flex items-center gap-1">
                        <Wind className="w-3.5 h-3.5 text-slate-500" />
                        Gust: <strong className="text-amber-400 font-mono">{day.maxGust} kt</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                        Score: <strong className="text-white font-mono">{day.score}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Best Window Box */}
                  <div className="mt-2 pt-2 border-t border-surf-border/40">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-sky-400" />
                      Best Window
                    </span>
                    <div className="text-xs font-bold font-mono text-white">
                      {day.bestWindow ? (
                        <span className="text-emerald-400 flex items-center justify-between">
                          <span>
                            {day.bestWindow.start} – {day.bestWindow.end}
                          </span>
                          <span className="text-[10px] text-cyan-300 font-normal">
                            {day.bestWindow.sailingStyle}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-normal">
                          No continuous &ge;70 window
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
